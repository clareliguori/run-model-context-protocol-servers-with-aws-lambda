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
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { createAutomatedOAuthTransport } from "./automated_oauth.js";
import logger from "./logger.js";

export async function createStdioClient(name: string, config: any): Promise<McpClient> {
  logger.info(`Initializing stdio server: ${name}`);
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env ? { ...process.env, ...config.env } : undefined,
  });
  return new McpClient({ transport });
}

export async function createLambdaFunctionClient(name: string, config: any): Promise<McpClient> {
  logger.info(`Initializing lambda function server: ${name}`);
  const transport = new LambdaFunctionClientTransport({
    functionName: config.functionName,
    regionName: config.region,
  });
  return new McpClient({ transport });
}

export async function createLambdaFunctionUrlClient(name: string, config: any): Promise<McpClient> {
  logger.info(`Initializing lambda function URL server: ${name}`);
  let functionUrl = config.functionUrl || config.function_url;
  const stackName = config.stackName || config.stack_name;
  const region = config.region || "us-west-2";

  if (!functionUrl && !stackName) throw new Error("Either functionUrl or stackName must be provided");
  if (functionUrl && stackName) throw new Error("Only one of functionUrl or stackName can be provided");

  if (stackName) {
    const outputKey = config.stackUrlOutputKey || config.stack_url_output_key || "FunctionUrl";
    functionUrl = await getCloudFormationOutput(stackName, outputKey, region);
  }

  const transport = new StreamableHTTPClientWithSigV4Transport(new URL(functionUrl), { region, service: "lambda" });
  return new McpClient({ transport });
}

export async function createAutomatedOAuthClient(name: string, config: any): Promise<McpClient> {
  logger.info(`Initializing automated OAuth server: ${name}`);
  const serverStackName = config.serverStackName || config.server_stack_name;
  const serverSsmParameterName = config.serverSsmParameterName || config.server_ssm_parameter_name;

  const sourceCount = [serverStackName, serverSsmParameterName].filter(Boolean).length;
  if (sourceCount === 0) throw new Error("One of serverStackName or serverSsmParameterName must be provided");
  if (sourceCount > 1) throw new Error("Only one of serverStackName or serverSsmParameterName can be provided");

  const serverStackUrlOutputKey = config.serverStackUrlOutputKey || config.server_stack_url_output_key || "McpServerUrl";
  const serverStackRegion = config.serverStackRegion || config.server_stack_region || "us-west-2";
  const serverSsmRegion = config.serverSsmRegion || config.server_ssm_region || "us-west-2";
  const authStackName = config.authStackName || config.auth_stack_name || "LambdaMcpServer-Auth";
  const authStackRegion = config.authStackRegion || config.auth_stack_region || "us-west-2";

  const serverUrl = serverStackName
    ? await getCloudFormationOutput(serverStackName, serverStackUrlOutputKey, serverStackRegion)
    : await getSsmParameter(serverSsmParameterName!, serverSsmRegion);

  const clientId = await getCloudFormationOutput(authStackName, "AutomatedOAuthClientId", authStackRegion);
  const clientSecret = await getClientSecret(authStackName, authStackRegion);

  const transport = await createAutomatedOAuthTransport(serverUrl, clientId, clientSecret);

  return new McpClient({ transport });
}

async function getCloudFormationOutput(stackName: string, outputKey: string, region: string): Promise<string> {
  const client = new CloudFormationClient({ region });
  const response = await client.send(new DescribeStacksCommand({ StackName: stackName }));
  const output = response.Stacks?.[0]?.Outputs?.find((o) => o.OutputKey === outputKey);
  if (!output?.OutputValue) throw new Error(`Output ${outputKey} not found in stack ${stackName}`);
  return output.OutputValue;
}

async function getSsmParameter(parameterName: string, region: string): Promise<string> {
  const client = new SSMClient({ region });
  const response = await client.send(new GetParameterCommand({ Name: parameterName }));
  if (!response.Parameter?.Value) throw new Error(`Parameter ${parameterName} not found`);
  const parsed = JSON.parse(response.Parameter.Value);
  if (!parsed.url) throw new Error(`No 'url' key found in SSM parameter`);
  return parsed.url;
}

async function getClientSecret(authStackName: string, authStackRegion: string): Promise<string> {
  const secretArn = await getCloudFormationOutput(authStackName, "OAuthClientSecretArn", authStackRegion);
  const client = new SecretsManagerClient({ region: authStackRegion });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!response.SecretString) throw new Error("No secret string found");
  return response.SecretString;
}
