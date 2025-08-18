#!/usr/bin/env node

import {
  SSMClient,
  GetParameterCommand,
  DeleteParameterCommand,
} from "@aws-sdk/client-ssm";
import {
  BedrockAgentCoreControlClient,
  ListGatewayTargetsCommand,
  DeleteGatewayTargetCommand,
  DeleteGatewayCommand,
} from "@aws-sdk/client-bedrock-agentcore-control";

async function main() {
  const region = "us-west-2";

  // Get unique suffix for integration tests
  const suffix =
    "INTEG_TEST_ID" in process.env ? `-${process.env["INTEG_TEST_ID"]}` : "";

  // Get gateway info from SSM
  const ssmClient = new SSMClient({ region });

  let gatewayInfo: { gatewayId: string };
  try {
    const response = await ssmClient.send(
      new GetParameterCommand({
        Name: `LambdaMcpServer-Dictionary-Gateway${suffix}`,
      })
    );
    gatewayInfo = JSON.parse(response.Parameter!.Value!);
  } catch (error: any) {
    if (error.name === "ParameterNotFound") {
      console.log("Gateway parameter not found. Nothing to tear down.");
      return;
    }
    throw error;
  }

  const agentCoreClient = new BedrockAgentCoreControlClient({ region });

  // Delete all gateway targets
  const targets = await agentCoreClient.send(
    new ListGatewayTargetsCommand({
      gatewayIdentifier: gatewayInfo.gatewayId,
    })
  );

  for (const target of targets.items || []) {
    await agentCoreClient.send(
      new DeleteGatewayTargetCommand({
        gatewayIdentifier: gatewayInfo.gatewayId,
        targetId: target.targetId!,
      })
    );
    console.log(`Deleted target: ${target.targetId}`);
  }

  // Delete gateway
  await agentCoreClient.send(
    new DeleteGatewayCommand({
      gatewayIdentifier: gatewayInfo.gatewayId,
    })
  );

  // Delete SSM parameter
  await ssmClient.send(
    new DeleteParameterCommand({
      Name: `LambdaMcpServer-Dictionary-Gateway${suffix}`,
    })
  );

  console.log(`Gateway ${gatewayInfo.gatewayId} deleted successfully`);
}

main().catch(console.error);
