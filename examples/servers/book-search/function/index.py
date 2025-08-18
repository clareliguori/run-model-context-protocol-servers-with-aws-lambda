import sys
from mcp.client.stdio import StdioServerParameters
from mcp_lambda import (
    BedrockAgentCoreGatewayTargetHandler,
    StdioServerAdapterRequestHandler,
)

server_params = StdioServerParameters(
    command=sys.executable,
    args=[
        "-c",
        "from mcp_openapi_proxy import main; main()",
    ],
    env={"OPENAPI_SPEC_URL": "file://open-library-openapi.json"},
)

request_handler = StdioServerAdapterRequestHandler(server_params)
event_handler = BedrockAgentCoreGatewayTargetHandler(request_handler)


def handler(event, context):
    return event_handler.handle(event, context)
