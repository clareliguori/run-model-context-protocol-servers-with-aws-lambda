import { Agent, McpClient } from "@strands-agents/sdk";
import logger from "./logger.js";

export class ChatSession {
  private agent: Agent;
  private userUtterances: string[];
  private mcpClients: McpClient[];

  constructor(agent: Agent, userUtterances: string[], mcpClients: McpClient[]) {
    this.agent = agent;
    this.userUtterances = userUtterances;
    this.mcpClients = mcpClients;
  }

  async start(): Promise<void> {
    try {
      for (const userInput of this.userUtterances) {
        console.log(`\nYou: ${userInput}`);
        process.stdout.write("\nAssistant: ");

        logger.info(`Starting agent invocation for: "${userInput}"`);
        const startTime = Date.now();

        try {
          await this.agent.invoke(userInput);
          const duration = Date.now() - startTime;
          logger.info(`Agent invocation completed in ${duration}ms`);
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error(`Agent invocation failed after ${duration}ms:`, error);
          throw error;
        }
      }
    } finally {
      logger.info("Disconnecting MCP clients...");
      await Promise.all(this.mcpClients.map(client => client.disconnect()));
      logger.info("All MCP clients disconnected");
    }
  }
}
