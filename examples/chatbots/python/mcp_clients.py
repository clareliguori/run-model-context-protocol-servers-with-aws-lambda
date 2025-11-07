"""MCP client adapters for Strands Agent integration."""

import boto3
import os
from botocore.exceptions import ClientError
from mcp import stdio_client, StdioServerParameters
from mcp_lambda import LambdaFunctionParameters, lambda_function_client
from mcp_lambda.client.streamable_http_sigv4 import streamablehttp_client_with_sigv4
from strands.tools.mcp import MCPClient
from contextlib import asynccontextmanager
from typing import Any, Dict
from interactive_oauth import InteractiveOAuthClient


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
    """
    Lambda Function URL client for MCP servers running behind Lambda function URLs.

    This client uses AWS SigV4 authentication to communicate with MCP servers
    deployed as Lambda functions with function URLs enabled.
    """

    # Handle camelCase parameter names from JSON config
    function_url = config.get("functionUrl", config.get("function_url"))
    stack_name = config.get("stackName", config.get("stack_name"))
    stack_url_output_key = config.get(
        "stackUrlOutputKey", config.get("stack_url_output_key")
    )
    region = config.get("region", "us-west-2")  # Default to us-west-2 if not specified

    # Validate config
    if not function_url and not stack_name:
        raise ValueError(
            "Either function_url must be provided or stack_name must be provided for CloudFormation lookup"
        )

    if function_url and stack_name:
        raise ValueError("Only one of function_url or stack_name can be provided")

    # Resolve function URL from CloudFormation if needed
    if stack_name:
        # Default output key if not specified
        if not stack_url_output_key:
            stack_url_output_key = "FunctionUrl"
        
        function_url = _get_cloudformation_output(
            stack_name, stack_url_output_key, region, "Function URL"
        )

    # Get AWS credentials
    session = boto3.Session()
    credentials = session.get_credentials()
    if not credentials:
        raise ValueError("AWS credentials not found. Please configure your AWS credentials.")

    return MCPClient(lambda: streamablehttp_client_with_sigv4(
        url=function_url, 
        credentials=credentials,
        service="lambda",
        region=region
    ))


def create_interactive_oauth_client(name: str, config: Dict[str, Any]) -> MCPClient:
    """
    Create an MCP client for interactive OAuth servers.

    Since API Gateway creates a new, unique endpoint for each gateway, this
    client can lookup the gateway URL from a CloudFormation stack output instead of requiring
    the user to statically configure the server URL.

    The example OAuth-enabled MCP servers in this repo all require distributing an OAuth client ID
    to the clients, and do not support dynamic client registration. By default, this client will
    look up the client ID from a CloudFormation stack output to simplify configuration for the
    example chatbot.
    """

    # Validate config sources
    server_url = config.get("serverUrl", config.get("server_url"))
    server_stack_name = config.get("serverStackName", config.get("server_stack_name"))
    server_ssm_parameter_name = config.get(
        "serverSsmParameterName", config.get("server_ssm_parameter_name")
    )

    source_count = sum(
        [
            bool(server_url),
            bool(server_stack_name),
            bool(server_ssm_parameter_name),
        ]
    )

    if source_count == 0:
        raise ValueError(
            "One of server_url, server_stack_name, or server_ssm_parameter_name must be provided"
        )

    if source_count > 1:
        raise ValueError(
            "Only one of server_url, server_stack_name, or server_ssm_parameter_name can be provided"
        )

    # Resolve server URL from CloudFormation or SSM if needed
    if server_stack_name:
        server_url = _get_server_url_from_cloudformation(
            server_stack_name,
            config.get(
                "serverStackUrlOutputKey",
                config.get("server_stack_url_output_key", "McpServerUrl"),
            ),
            config.get(
                "serverStackRegion", config.get("server_stack_region", "us-west-2")
            ),
        )
    elif server_ssm_parameter_name:
        server_url = _get_server_url_from_ssm(
            server_ssm_parameter_name,
            config.get("serverSsmRegion", config.get("server_ssm_region", "us-west-2")),
        )

    # Get OAuth client ID if configured
    client_id = None
    if config.get(
        "lookupClientIdFromCloudformation",
        config.get("lookup_client_id_from_cloudformation", True),
    ):
        client_id = _get_client_id_from_cloudformation(
            config.get(
                "authStackName", config.get("auth_stack_name", "LambdaMcpServer-Auth")
            ),
            config.get(
                "authStackClientIdOutputKey",
                config.get(
                    "auth_stack_client_id_output_key", "InteractiveOAuthClientId"
                ),
            ),
            config.get("authStackRegion", config.get("auth_stack_region", "us-west-2")),
        )

    # Create OAuth client
    oauth_client = InteractiveOAuthClient(name, server_url, client_id)
    
    @asynccontextmanager
    async def create_oauth_transport():
        async with await oauth_client.create_transport() as transport:
            yield transport
    
    return MCPClient(create_oauth_transport)


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


def _get_server_url_from_cloudformation(
    stack_name: str, output_key: str, region: str
) -> str:
    """Retrieve server URL from CloudFormation stack outputs."""
    return _get_cloudformation_output(stack_name, output_key, region, "Server URL")


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

        return response["Parameter"]["Value"]

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


def _get_client_id_from_cloudformation(
    stack_name: str, output_key: str, region: str
) -> str:
    """Retrieve OAuth client ID from CloudFormation stack outputs."""
    return _get_cloudformation_output(stack_name, output_key, region, "OAuth client ID")
