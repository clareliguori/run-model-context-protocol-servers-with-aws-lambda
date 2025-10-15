from aws_cdk import (
    App,
    Aspects,
    CfnOutput,
    Environment,
    Fn,
    SecretValue,
    Stack,
    aws_bedrockagentcore as bedrockagentcore,
    aws_secretsmanager as secretsmanager,
)
from cdk_nag import AwsSolutionsChecks, NagSuppressions
from constructs import Construct
import json
import os


class LambdaZenMcpServer(Stack):
    def __init__(
        self, scope: Construct, construct_id: str, stack_name_suffix: str, **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Load OpenAPI schema
        with open(os.path.join(os.path.dirname(__file__), "zenquotes-openapi.json"), "r") as f:
            openapi_schema = json.load(f)

        # Get gateway name with length limit
        gateway_name = f"LambdaMcpServer-Zen-Gateway{stack_name_suffix}"
        if len(gateway_name) > 48:
            gateway_name = gateway_name[:48].rstrip('-')

        gateway = bedrockagentcore.CfnGateway(
            self,
            "Gateway",
            name=gateway_name,
            role_arn=f"arn:aws:iam::{self.account}:role/mcp-lambda-example-agentcore-gateways",
            protocol_type="MCP",
            authorizer_type="CUSTOM_JWT",
            authorizer_configuration={
                "customJwtAuthorizer": {
                    "allowedClients": [
                        Fn.import_value("LambdaMcpServer-Auth-InteractiveOAuthClientId"),
                        Fn.import_value("LambdaMcpServer-Auth-AutomatedOAuthClientId"),
                    ],
                    "discoveryUrl": Fn.sub(
                        "${IssuerDomain}/.well-known/openid-configuration",
                        {
                            "IssuerDomain": Fn.import_value("LambdaMcpServer-Auth-IssuerDomain"),
                        }
                    ),
                }
            },
            exception_level="DEBUG",
        )

        # Create secret for API key
        api_key_secret = secretsmanager.Secret(
            self,
            "ZenQuotesApiKey",
            secret_string_value=SecretValue.unsafe_plain_text("hello world")
        )

        NagSuppressions.add_resource_suppressions(
            api_key_secret,
            [{"id": "AwsSolutions-SMG4", "reason": "Placeholder API key for demo purposes"}]
        )

        bedrockagentcore.CfnGatewayTarget(
            self,
            "GatewayTarget",
            gateway_identifier=gateway.attr_gateway_identifier,
            name="zenquotes-target",
            target_configuration={
                "mcp": {
                    "open_api_schema": {
                        "inline_payload": json.dumps(openapi_schema)
                    }
                }
            },
            credential_provider_configurations=[
                {
                    "credentialProviderType": "API_KEY",
                    "credentialProvider": {
                        "apiKeyCredentialProvider": {
                            "providerArn": api_key_secret.secret_arn,
                            "credentialLocation": "HEADER",
                            "credentialParameterName": "X-Ignore-This"
                        }
                    }
                }
            ],
        )

        CfnOutput(
            self,
            "GatewayIdOutput",
            value=gateway.attr_gateway_identifier,
        )

        CfnOutput(
            self,
            "GatewayUrlOutput",
            value=gateway.attr_gateway_url,
        )


app = App()
env = Environment(account=os.environ["CDK_DEFAULT_ACCOUNT"], region="us-west-2")
stack_name_suffix = (
    f'-{os.environ["INTEG_TEST_ID"]}' if "INTEG_TEST_ID" in os.environ else ""
)
stack = LambdaZenMcpServer(
    app,
    "LambdaMcpServer-Zen",
    stack_name_suffix,
    stack_name="LambdaMcpServer-Zen" + stack_name_suffix,
    env=env,
)
Aspects.of(stack).add(AwsSolutionsChecks(verbose=True))
app.synth()
