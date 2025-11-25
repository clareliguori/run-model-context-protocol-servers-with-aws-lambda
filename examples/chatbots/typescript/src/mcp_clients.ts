/**
 * MCP client adapters for Strands Agent integration.
 */

import { McpClient } from "@strands-agents/sdk";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  LambdaFunctionClientTransport,
  StreamableHTTPClientWithSigV4Transport,
} from "@aws/run-mcp-servers-with-aws-lambda";
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { InteractiveOAuthClient } from "./interactive_oauth.js";
import logger from "./logger.js";

export async function createStdioClient(
  name: string,
  config: any
): Promise<McpClient> {
  logger.info(`Initializing stdio server: ${name}`);
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env ? { ...process.env, ...config.env } : undefined,
  });

  return new McpClient({ transport });
}

export async function createLambdaFunctionClient(
  name: string,
  config: any
): Promise<McpClient> {
  logger.info(`Initializing lambda function server: ${name}`);
  const transport = new LambdaFunctionClientTransport({
    functionName: config.functionName,
    regionName: config.region,
  });

  return new McpClient({ transport });
}

export async function createLambdaFunctionUrlClient(
  name: string,
  config: any
): Promise<McpClient> {
  logger.info(`Initializing lambda function URL server: ${name}`);
  let functionUrl = config.functionUrl || config.function_url;
  const stackName = config.stackName || config.stack_name;
  const region = config.region || "us-west-2";

  if (!functionUrl && !stackName) {
    throw new Error("Either functionUrl or stackName must be provided");
  }

  if (functionUrl && stackName) {
    throw new Error("Only one of functionUrl or stackName can be provided");
  }

  if (stackName) {
    const outputKey = config.stackUrlOutputKey || config.stack_url_output_key || "FunctionUrl";
    functionUrl = await getCloudFormationOutput(stackName, outputKey, region);
  }

  const transport = new StreamableHTTPClientWithSigV4Transport(
    new URL(functionUrl),
    { region, service: "lambda" }
  );

  return new McpClient({ transport });
}

export async function createInteractiveOAuthClient(
  name: string,
  config: any
): Promise<McpClient> {
  logger.info(`Initializing OAuth server: ${name}`);
  // Validate config sources
  const serverUrl = config.serverUrl || config.server_url;
  const serverStackName = config.serverStackName || config.server_stack_name;
  const serverSsmParameterName = config.serverSsmParameterName || config.server_ssm_parameter_name;

  const sourceCount = [serverUrl, serverStackName, serverSsmParameterName].filter(Boolean).length;

  if (sourceCount === 0) {
    throw new Error(
      "One of serverUrl, serverStackName, or serverSsmParameterName must be provided"
    );
  }

  if (sourceCount > 1) {
    throw new Error(
      "Only one of serverUrl, serverStackName, or serverSsmParameterName can be provided"
    );
  }

  // Resolve server URL from CloudFormation or SSM if needed
  let resolvedServerUrl = serverUrl;
  if (serverStackName) {
    const outputKey = config.serverStackUrlOutputKey || config.server_stack_url_output_key || "McpServerUrl";
    const region = config.serverStackRegion || config.server_stack_region || "us-west-2";
    resolvedServerUrl = await getCloudFormationOutput(serverStackName, outputKey, region);
  } else if (serverSsmParameterName) {
    const region = config.serverSsmRegion || config.server_ssm_region || "us-west-2";
    resolvedServerUrl = await getSsmParameter(serverSsmParameterName, region);
  }

  // Get OAuth client ID if configured
  let clientId: string | undefined;
  const lookupClientId = config.lookupClientIdFromCloudformation ?? config.lookup_client_id_from_cloudformation ?? true;
  if (lookupClientId) {
    const authStackName = config.authStackName || config.auth_stack_name || "LambdaMcpServer-Auth";
    const authStackClientIdOutputKey = config.authStackClientIdOutputKey || config.auth_stack_client_id_output_key || "InteractiveOAuthClientId";
    const authStackRegion = config.authStackRegion || config.auth_stack_region || "us-west-2";
    clientId = await getCloudFormationOutput(authStackName, authStackClientIdOutputKey, authStackRegion);
  }

  const oauthClient = new InteractiveOAuthClient(name, resolvedServerUrl, clientId);
  await oauthClient.initialize();

  return new McpClient({ transport: oauthClient });
}

async function getCloudFormationOutput(
  stackName: string,
  outputKey: string,
  region: string
): Promise<string> {
  const client = new CloudFormationClient({ region });
  const response = await client.send(
    new DescribeStacksCommand({ StackName: stackName })
  );

  const stack = response.Stacks?.[0];
  if (!stack) {
    throw new Error(`Stack ${stackName} not found`);
  }

  const output = stack.Outputs?.find((o) => o.OutputKey === outputKey);
  if (!output?.OutputValue) {
    throw new Error(`Output ${outputKey} not found in stack ${stackName}`);
  }

  return output.OutputValue;
}

async function getSsmParameter(
  parameterName: string,
  region: string
): Promise<string> {
  const client = new SSMClient({ region });
  const response = await client.send(
    new GetParameterCommand({ Name: parameterName })
  );

  if (!response.Parameter?.Value) {
    throw new Error(`Parameter ${parameterName} not found or has no value`);
  }

  return response.Parameter.Value;
}
