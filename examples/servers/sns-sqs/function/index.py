import os
import sys

import boto3
from mcp.client.stdio import StdioServerParameters
from mcp_lambda import (
    BedrockAgentCoreGatewayTargetHandler,
    StdioServerAdapterRequestHandler,
)

# Get AWS credentials from Lambda execution role to pass to subprocess
session = boto3.Session()
credentials = session.get_credentials()
if credentials is None:
    raise RuntimeError("Unable to retrieve AWS credentials from the execution environment")
resolved = credentials.get_frozen_credentials()

# Write credentials to disk as default profile (required by amazon-sns-sqs-mcp-server)
aws_dir = "/tmp/.aws"
os.makedirs(aws_dir, exist_ok=True)
with open(f"{aws_dir}/credentials", "w") as f:
    f.write("[default]\n")
    f.write(f"aws_access_key_id = {resolved.access_key}\n")
    f.write(f"aws_secret_access_key = {resolved.secret_key}\n")
    if resolved.token:
        f.write(f"aws_session_token = {resolved.token}\n")

server_params = StdioServerParameters(
    command=sys.executable,
    args=["-c", "from awslabs.amazon_sns_sqs_mcp_server.server import main; main()"],
    env={
        "AWS_DEFAULT_REGION": os.environ.get("AWS_REGION", "us-west-2"),
        "AWS_SHARED_CREDENTIALS_FILE": f"{aws_dir}/credentials",
    },
)

request_handler = StdioServerAdapterRequestHandler(server_params)
event_handler = BedrockAgentCoreGatewayTargetHandler(request_handler)


def handler(event, context):
    return event_handler.handle(event, context)
