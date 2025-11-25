import { Configuration } from "./configuration.js";
import { ChatSession } from "./chat_session.js";
import { Agent, BedrockModel } from "@strands-agents/sdk";
import {
  createStdioClient,
  createLambdaFunctionClient,
  createLambdaFunctionUrlClient,
  createInteractiveOAuthClient,
} from "./mcp_clients.js";
import logger from "./logger.js";

async function main(): Promise<void> {
  const config = new Configuration();
  const serverConfig = Configuration.loadConfig("./servers_config.json");

  const mcpClients = [];

  // Initialize stdio servers
  for (const [name, srvConfig] of Object.entries(serverConfig.stdioServers)) {
    mcpClients.push(await createStdioClient(name, srvConfig));
  }

  // Initialize Lambda function servers
  for (const [name, srvConfig] of Object.entries(
    serverConfig.lambdaFunctionServers
  )) {
    mcpClients.push(await createLambdaFunctionClient(name, srvConfig));
  }

  // Initialize Lambda function URL servers
  for (const [name, srvConfig] of Object.entries(
    serverConfig.lambdaFunctionUrls || {}
  )) {
    mcpClients.push(await createLambdaFunctionUrlClient(name, srvConfig));
  }

  // Initialize interactive OAuth servers
  for (const [name, srvConfig] of Object.entries(
    serverConfig.oAuthServers || {}
  )) {
    mcpClients.push(await createInteractiveOAuthClient(name, srvConfig));
  }

  const model = new BedrockModel({
    region: config.bedrockClient.config.region as string,
    modelId: config.modelId,
  });

  const agent = new Agent({
    model,
    tools: mcpClients,
    systemPrompt: "You are a helpful assistant.",
  });

  const chatSession = new ChatSession(agent, mcpClients);

  await chatSession.start();
}

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

main().catch((error) => {
  logger.error("Error in main:", error);
  process.exit(1);
});
