import { Handler, Context } from "aws-lambda";
import {
  BedrockAgentCoreGatewayTargetHandler,
  StdioServerAdapterRequestHandler,
} from "@aws/run-mcp-servers-with-aws-lambda";

const serverParams = {
  command: "node",
  args: [
    "/var/task/node_modules/@ivotoby/openapi-mcp-server/bin/mcp-server.js",
    "--api-base-url",
    "https://api.dictionaryapi.dev/api/v2",
    "--openapi-spec",
    "./free-dictionary-openapi.json",
  ],
};

const requestHandler = new BedrockAgentCoreGatewayTargetHandler(
  new StdioServerAdapterRequestHandler(serverParams)
);

export const handler: Handler = async (
  event: Record<string, unknown>,
  context: Context
): Promise<unknown> => {
  return requestHandler.handle(event, context);
};
