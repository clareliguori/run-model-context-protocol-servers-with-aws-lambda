#!/usr/bin/env node

import { readFileSync } from "fs";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { SSMClient, PutParameterCommand } from "@aws-sdk/client-ssm";
import {
  BedrockAgentCoreControlClient,
  CreateGatewayCommand,
  CreateGatewayTargetCommand,
  GetGatewayCommand,
} from "@aws-sdk/client-bedrock-agentcore-control";

async function main() {
  const region = "us-west-2";

  // Get unique suffix for integration tests
  const suffix =
    "INTEG_TEST_ID" in process.env ? `-${process.env["INTEG_TEST_ID"]}` : "";

  // Get account ID
  const stsClient = new STSClient({ region });
  const identity = await stsClient.send(new GetCallerIdentityCommand({}));
  const accountId = identity.Account!;

  // Load tools list
  const toolsConfig = JSON.parse(readFileSync("tools-list.json", "utf8"));

  // Get Lambda function ARN from CloudFormation stack
  const cfClient = new CloudFormationClient({ region });
  const stackResponse = await cfClient.send(
    new DescribeStacksCommand({
      StackName: `LambdaMcpServer-Dictionary${suffix}`,
    })
  );

  let lambdaFunctionArn: string | undefined;
  for (const output of stackResponse.Stacks![0].Outputs || []) {
    if (output.OutputKey?.includes("ServerFunctionOutput")) {
      lambdaFunctionArn = output.OutputValue;
      break;
    }
  }

  if (!lambdaFunctionArn) {
    throw new Error("Lambda function ARN not found in stack outputs");
  }

  // Get Cognito authorizer info from Auth stack
  const authStackResponse = await cfClient.send(
    new DescribeStacksCommand({
      StackName: "LambdaMcpServer-Auth",
    })
  );

  const outputs: Record<string, string> = {};
  for (const output of authStackResponse.Stacks![0].Outputs || []) {
    outputs[output.OutputKey!] = output.OutputValue!;
  }

  const authorizerConfig = {
    customJWTAuthorizer: {
      allowedClients: [
        outputs.InteractiveOAuthClientId,
        outputs.AutomatedOAuthClientId,
      ],
      discoveryUrl: `${outputs.IssuerDomain}/.well-known/openid-configuration`,
    },
  };

  // Create Gateway
  const agentCoreClient = new BedrockAgentCoreControlClient({
    region,
    maxAttempts: 10,
  });
  const roleArn = `arn:aws:iam::${accountId}:role/mcp-lambda-example-agentcore-gateways`;

  let gatewayName = `LambdaMcpServer-Dictionary-Gateway${suffix}`;
  if (gatewayName.length > 50) {
    gatewayName = gatewayName.substring(0, 50).replace(/-+$/, '');
  }

  const gateway = await agentCoreClient.send(
    new CreateGatewayCommand({
      name: gatewayName,
      roleArn,
      protocolType: "MCP",
      authorizerType: "CUSTOM_JWT",
      authorizerConfiguration: authorizerConfig,
      exceptionLevel: "DEBUG",
    })
  );

  // Wait for gateway to be ready
  let attempts = 0;
  let gatewayReady = false;
  while (!gatewayReady && attempts < 30) {
    const gatewayStatus = await agentCoreClient.send(
      new GetGatewayCommand({
        gatewayIdentifier: gateway.gatewayId!,
      })
    );
    if (gatewayStatus.status === "READY") {
      gatewayReady = true;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      attempts++;
    }
  }

  if (!gatewayReady) {
    throw new Error("Gateway did not become ready within 30 attempts");
  }

  // Save Gateway URL and ID to SSM
  const ssmClient = new SSMClient({ region });
  const gatewayInfo = {
    gatewayId: gateway.gatewayId,
    url: gateway.gatewayUrl,
  };

  await ssmClient.send(
    new PutParameterCommand({
      Name: `LambdaMcpServer-Dictionary-Gateway${suffix}`,
      Value: JSON.stringify(gatewayInfo),
      Type: "String",
      Overwrite: true,
    })
  );

  // Create Lambda target
  const targetPayload = {
    lambdaArn: lambdaFunctionArn,
    toolSchema: { inlinePayload: toolsConfig.tools },
  };

  await agentCoreClient.send(
    new CreateGatewayTargetCommand({
      gatewayIdentifier: gateway.gatewayId,
      name: "dictionary-target",
      targetConfiguration: { mcp: { lambda: targetPayload } },
      credentialProviderConfigurations: [
        { credentialProviderType: "GATEWAY_IAM_ROLE" },
      ],
    })
  );

  console.log("Gateway created successfully:");
  console.log(`  ID: ${gateway.gatewayId}`);
  console.log(`  URL: ${gateway.gatewayUrl}`);
  console.log(`  Lambda ARN: ${lambdaFunctionArn}`);
  console.log(
    `  Saved to SSM parameter: LambdaMcpServer-Dictionary-Gateway${suffix}`
  );
}

main().catch(console.error);
