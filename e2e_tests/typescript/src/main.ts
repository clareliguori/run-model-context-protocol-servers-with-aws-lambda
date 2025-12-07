import { Configuration } from "./configuration.js";
import { ChatSession } from "./chat_session.js";
import { Agent, BedrockModel } from "@strands-agents/sdk";
import {
  createStdioClient,
  createLambdaFunctionClient,
  createLambdaFunctionUrlClient,
  createAutomatedOAuthClient,
} from "./mcp_clients.js";
import logger from "./logger.js";

async function main(): Promise<void> {
  logger.info(`Starting e2e test with LOG_LEVEL=${process.env.LOG_LEVEL || 'info'}`);
  logger.info(`Node version: ${process.version}`);

  const config = new Configuration();
  const serverConfig = Configuration.loadConfig("./servers_config.json");

  const mcpClients = [];

  logger.info("Initializing MCP clients...");
  for (const [name, srvConfig] of Object.entries(serverConfig.stdioServers || {})) {
    try {
      mcpClients.push(await createStdioClient(name, srvConfig));
    } catch (error) {
      logger.error(`Failed to initialize stdio server ${name}:`, error);
      throw error;
    }
  }

  for (const [name, srvConfig] of Object.entries(serverConfig.lambdaFunctionServers || {})) {
    try {
      mcpClients.push(await createLambdaFunctionClient(name, srvConfig));
    } catch (error) {
      logger.error(`Failed to initialize lambda function server ${name}:`, error);
      throw error;
    }
  }

  for (const [name, srvConfig] of Object.entries(serverConfig.lambdaFunctionUrls || {})) {
    try {
      mcpClients.push(await createLambdaFunctionUrlClient(name, srvConfig));
    } catch (error) {
      logger.error(`Failed to initialize lambda function URL server ${name}:`, error);
      throw error;
    }
  }

  for (const [name, srvConfig] of Object.entries(serverConfig.oAuthServers || {})) {
    try {
      const client = await createAutomatedOAuthClient(name, srvConfig);
      mcpClients.push(client);
    } catch (error) {
      logger.error(`Failed to initialize OAuth server ${name}:`, error);
      throw error;
    }
  }

  logger.info("Connecting to MCP clients with retry...");
  await Promise.all(mcpClients.map(async (client, i) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Connection timeout`)), 30000)
        );
        await Promise.race([client.connect(), timeout]);
        return;
      } catch (error) {
        if (attempt < 4) {
          const delay = 2000 * Math.pow(2, attempt);
          logger.warn(`Client ${i} connection failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
  }));

  logger.info(`Successfully initialized ${mcpClients.length} MCP clients`);

  const userUtterances = Configuration.loadConfig("../test_questions.json") as string[];
  logger.info(`Loaded ${userUtterances.length} test questions`);

  logger.info("Initializing Bedrock model...");
  const region = typeof config.bedrockClient.config.region === 'function'
    ? await config.bedrockClient.config.region()
    : config.bedrockClient.config.region;
  const model = new BedrockModel({
    region: region as string,
    modelId: config.modelId,
    stream: false,
  });
  logger.info(`Using model: ${config.modelId} in region: ${region} (streaming disabled)`);

  logger.info("Creating agent...");
  const agent = new Agent({
    model,
    tools: mcpClients,
    systemPrompt: "You are a helpful assistant.",
  });
  logger.info("Agent created successfully");

  const chatSession = new ChatSession(agent, userUtterances, mcpClients);

  logger.info("Starting chat session...");
  await chatSession.start();
  logger.info("Chat session completed successfully");
}

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

main().catch((error) => {
  logger.error("Error in main:", error);
  if (error instanceof Error) {
    logger.error(`Error type: ${error.constructor.name}`);
    logger.error(`Error message: ${error.message}`);
    if (error.stack) {
      logger.error("Stack trace:", error.stack);
    }
    if ('cause' in error && error.cause) {
      logger.error("Error cause:", JSON.stringify(error.cause, null, 2));
    }
  }
  process.exit(1);
});
