import { Configuration } from "./configuration.js";
import { ChatSession } from "./chat_session.js";
import { Agent, BedrockModel, McpClient } from "@strands-agents/sdk";
import {
  createStdioClient,
  createLambdaFunctionClient,
  createLambdaFunctionUrlClient,
  createAutomatedOAuthClient,
} from "./mcp_clients.js";
import logger from "./logger.js";

async function main(): Promise<void> {
  logger.info(
    `Starting e2e test with LOG_LEVEL=${process.env.LOG_LEVEL || "info"}`
  );
  logger.info(`Node version: ${process.version}`);

  const config = new Configuration();
  const serverConfig = Configuration.loadConfig("./servers_config.json");

  const mcpClients: Array<{ name: string; client: McpClient }> = [];

  logger.info("Initializing MCP clients...");
  for (const [name, srvConfig] of Object.entries(
    serverConfig.stdioServers || {}
  )) {
    try {
      const client = await createStdioClient(name, srvConfig);
      await client.connect();
      mcpClients.push({ name, client });
    } catch (error) {
      logger.error(`Failed to initialize stdio server ${name}:`, error);
      throw error;
    }
  }

  for (const [name, srvConfig] of Object.entries(
    serverConfig.lambdaFunctionServers || {}
  )) {
    try {
      const client = await createLambdaFunctionClient(name, srvConfig);
      await client.connect();
      mcpClients.push({ name, client });
    } catch (error) {
      logger.error(
        `Failed to initialize lambda function server ${name}:`,
        error
      );
      throw error;
    }
  }

  for (const [name, srvConfig] of Object.entries(
    serverConfig.lambdaFunctionUrls || {}
  )) {
    try {
      const client = await createLambdaFunctionUrlClient(name, srvConfig);
      await client.connect();
      mcpClients.push({ name, client });
    } catch (error) {
      logger.error(
        `Failed to initialize lambda function URL server ${name}:`,
        error
      );
      throw error;
    }
  }

  for (const [name, srvConfig] of Object.entries(
    serverConfig.oAuthServers || {}
  )) {
    try {
      let client: McpClient | undefined;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          client = await createAutomatedOAuthClient(name, srvConfig);
          const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Connection timeout`)), 30000)
          );
          await Promise.race([client.connect(), timeout]);
          break;
        } catch (error) {
          if (attempt < 4) {
            const delay = 2000 * Math.pow(2, attempt);
            logger.warn(`OAuth server ${name} connection failed, retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          } else {
            throw error;
          }
        }
      }
      mcpClients.push({ name, client: client! });
    } catch (error) {
      logger.error(`Failed to initialize OAuth server ${name}:`, error);
      throw error;
    }
  }

  logger.info(`Successfully initialized ${mcpClients.length} MCP clients`);

  const userUtterances = Configuration.loadConfig(
    "../test_questions.json"
  ) as string[];
  logger.info(`Loaded ${userUtterances.length} test questions`);

  logger.info("Initializing Bedrock model...");
  const region =
    typeof config.bedrockClient.config.region === "function"
      ? await config.bedrockClient.config.region()
      : config.bedrockClient.config.region;
  const model = new BedrockModel({
    region: region as string,
    modelId: config.modelId,
    stream: false,
  });
  logger.info(
    `Using model: ${config.modelId} in region: ${region} (streaming disabled)`
  );

  logger.info("Creating agent...");
  const clientsOnly = mcpClients.map(({ client }) => client);
  const agent = new Agent({
    model,
    tools: clientsOnly,
    systemPrompt: "You are a helpful assistant. Always retry tool call failures to recover from issues like transient network errors.",
  });
  logger.info("Agent created successfully");

  // Pre-initialize the agent by calling initialize() on each MCP client individually
  // This avoids the parallel listTools() calls that can timeout in CI environments
  logger.info("Initializing agent (loading tools from MCP clients)...");
  for (const { name, client } of mcpClients) {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        logger.debug(`Initializing tools from ${name} (attempt ${attempt + 1})...`);
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout loading tools from ${name}`)), 90000)
        );
        const tools = await Promise.race([client.listTools(), timeout]);
        (agent as any)._toolRegistry.addAll(tools);
        logger.info(`Tools from ${name}: ${tools.map(t => t.name).join(", ")}`);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error as Error;
        if (attempt < 2) {
          const delay = 3000 * Math.pow(2, attempt);
          logger.warn(`Failed to load tools from ${name} (attempt ${attempt + 1}), retrying in ${delay}ms...`);
          try {
            await client.connect(true);
          } catch {
            // Ignore reconnect errors
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    if (lastError) {
      logger.error(`Failed to load tools from ${name} after 3 attempts:`, lastError);
      throw lastError;
    }
  }
  // Mark agent as initialized since we manually loaded all tools
  (agent as any)._initialized = true;
  logger.info("Agent initialized successfully");

  const chatSession = new ChatSession(agent, userUtterances, clientsOnly);

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
    if ("cause" in error && error.cause) {
      logger.error("Error cause:", JSON.stringify(error.cause, null, 2));
    }
  }
  process.exit(1);
});
