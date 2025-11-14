"""MCP client adapters for Strands Agent integration."""

import boto3
import os
from botocore.exceptions import ClientError
from mcp import stdio_client, StdioServerParameters
from mcp_lambda import LambdaFunctionParameters, lambda_function_client
from mcp_proxy_for_aws.client import aws_iam_streamablehttp_client
from strands.tools.mcp import MCPClient
from contextlib import asynccontextmanager
from typing import Any, Dict
from automated_oauth import AutomatedOAuthClient


def create_stdio_client(name: str, config: Dict[str, Any]) -> MCPClient:
    """Create an MCP client for stdio servers."""
    return MCPClient(
        lambda: stdio_client(
            StdioServerParameters(
                command=config["command"],
                args=config["args"],
                env=({**os.environ, **config["env"]} if config.get("env") else None),
            )
        )
    )


def create_lambda_function_client(name: str, config: Dict[str, Any]) -> MCPClient:
    """Create an MCP client for Lambda function servers."""
    return MCPClient(
        lambda: lambda_function_client(
            LambdaFunctionParameters(
                function_name=config["functionName"], region_name=config["region"]
            )
        )
    )


def create_lambda_function_url_client(name: str, config: Dict[str, Any]) -> MCPClient:
    """Create an MCP client for Lambda function URL servers."""

    # Handle camelCase parameter names from JSON config
    function_url = config.get("functionUrl", config.get("function_url"))
    stack_name = config.get("stackName", config.get("stack_name"))
    stack_url_output_key = config.get(
        "stackUrlOutputKey", config.get("stack_url_output_key")
    )
    region = config.get("region", "us-west-2")

    # Validate config
    if not function_url and not stack_name:
        raise ValueError(
            "Either function_url must be provided or stack_name must be provided for CloudFormation lookup"
        )

    if function_url and stack_name:
        raise ValueError("Only one of function_url or stack_name can be provided")

    # Resolve function URL from CloudFormation if needed
    if stack_name:
        if not stack_url_output_key:
            stack_url_output_key = "FunctionUrl"

        function_url = _get_cloudformation_output(
            stack_name, stack_url_output_key, region, "Function URL"
        )

    return MCPClient(
        lambda: aws_iam_streamablehttp_client(
            endpoint=function_url, aws_service="lambda", aws_region=region
        )
    )


def create_automated_oauth_client(name: str, config: Dict[str, Any]) -> MCPClient:
    """Create an MCP client for automated OAuth servers."""

    # Resolve server URL from CloudFormation or SSM if needed
    server_url = None
    server_stack_name = config.get("serverStackName", config.get("server_stack_name"))
    server_ssm_parameter_name = config.get(
        "serverSsmParameterName", config.get("server_ssm_parameter_name")
    )

    if server_stack_name:
        server_url = _get_cloudformation_output(
            server_stack_name,
            config.get(
                "serverStackUrlOutputKey",
                config.get("server_stack_url_output_key", "McpServerUrl"),
            ),
            config.get(
                "serverStackRegion", config.get("server_stack_region", "us-west-2")
            ),
            "Server URL",
        )
    elif server_ssm_parameter_name:
        server_url = _get_server_url_from_ssm(
            server_ssm_parameter_name,
            config.get("serverSsmRegion", config.get("server_ssm_region", "us-west-2")),
        )
    else:
        raise ValueError(
            "Either server_stack_name or server_ssm_parameter_name must be provided"
        )

    # Get OAuth client configuration
    auth_stack_name = "LambdaMcpServer-Auth"
    auth_stack_region = "us-west-2"

    client_id = _get_cloudformation_output(
        auth_stack_name, "AutomatedOAuthClientId", auth_stack_region, "OAuth client ID"
    )

    client_secret = _get_client_secret_from_secrets_manager(
        auth_stack_name, auth_stack_region
    )

    # Create OAuth client with resolved configuration
    oauth_client = AutomatedOAuthClient(name, server_url, client_id, client_secret)

    @asynccontextmanager
    async def create_oauth_transport():
        async with await oauth_client.create_transport() as transport:
            yield transport

    return MCPClient(create_oauth_transport)


def _get_server_url_from_ssm(parameter_name: str, region: str) -> str:
    """Retrieve server URL from SSM parameter."""
    try:
        session = boto3.Session()
        ssm_client = session.client("ssm", region_name=region)
        response = ssm_client.get_parameter(Name=parameter_name, WithDecryption=True)

        if not response.get("Parameter") or not response["Parameter"].get("Value"):
            raise ValueError(
                f"SSM parameter '{parameter_name}' not found or has no value"
            )

        parameter_value = response["Parameter"]["Value"]

        # Parse JSON and extract URL
        try:
            import json

            parameter_json = json.loads(parameter_value)
            server_url = parameter_json.get("url")

            if not server_url:
                raise ValueError(
                    f"No 'url' key found in SSM parameter JSON: {parameter_name}"
                )

            return server_url

        except json.JSONDecodeError as e:
            raise ValueError(
                f"SSM parameter value is not valid JSON: {parameter_name}. Error: {e}"
            )

    except ClientError as error:
        error_code = error.response["Error"]["Code"]
        if error_code == "ParameterNotFound":
            raise ValueError(f"SSM parameter '{parameter_name}' not found")
        elif error_code in ["AccessDenied", "UnauthorizedOperation"]:
            raise ValueError(
                f"Insufficient permissions to access SSM parameter '{parameter_name}'"
            )
        else:
            raise ValueError(
                f"Could not retrieve server URL from SSM parameter {parameter_name}: {error}"
            )


def _get_client_secret_from_secrets_manager(
    auth_stack_name: str, auth_stack_region: str
) -> str:
    """Retrieve the client secret from AWS Secrets Manager."""
    try:
        # First get the secret ARN from CloudFormation
        secret_arn = _get_cloudformation_output(
            auth_stack_name,
            "OAuthClientSecretArn",
            auth_stack_region,
            "OAuth client secret ARN",
        )

        # Now get the secret value from Secrets Manager
        session = boto3.Session()
        secrets_client = session.client("secretsmanager", region_name=auth_stack_region)
        secret_response = secrets_client.get_secret_value(SecretId=secret_arn)

        if not secret_response.get("SecretString"):
            raise ValueError("No secret string found in Secrets Manager response")

        return secret_response["SecretString"]

    except ClientError as error:
        error_code = error.response["Error"]["Code"]
        if error_code == "ResourceNotFoundException":
            raise ValueError("OAuth client secret not found in Secrets Manager")
        elif error_code in ["AccessDenied", "UnauthorizedOperation"]:
            raise ValueError("Insufficient permissions to access Secrets Manager")
        else:
            raise ValueError(f"Could not retrieve OAuth client secret: {error}")


def _get_cloudformation_output(
    stack_name: str, output_key: str, region: str, value_description: str = "value"
) -> str:
    """Retrieve output value from CloudFormation stack."""
    try:
        session = boto3.Session()
        cf_client = session.client("cloudformation", region_name=region)
        response = cf_client.describe_stacks(StackName=stack_name)

        if not response.get("Stacks"):
            raise ValueError(f"CloudFormation stack '{stack_name}' not found")

        stack = response["Stacks"][0]
        if not stack.get("Outputs"):
            raise ValueError(f"No outputs found in CloudFormation stack '{stack_name}'")

        output = next(
            (
                output
                for output in stack["Outputs"]
                if output["OutputKey"] == output_key
            ),
            None,
        )

        if not output or not output.get("OutputValue"):
            raise ValueError(
                f"{value_description} output not found in CloudFormation stack. Output key: {output_key}"
            )

        return output["OutputValue"]

    except ClientError as error:
        error_code = error.response["Error"]["Code"]
        if error_code == "ValidationException":
            raise ValueError(
                f"CloudFormation stack '{stack_name}' does not exist or is not accessible"
            )
        elif error_code in ["AccessDenied", "UnauthorizedOperation"]:
            raise ValueError(
                f"Insufficient permissions to access CloudFormation stack '{stack_name}'"
            )
        else:
            raise ValueError(
                f"Could not retrieve {value_description} from CloudFormation stack {stack_name}: {error}"
            )
