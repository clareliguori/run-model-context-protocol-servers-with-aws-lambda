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
        await this.agent.invoke(userInput);
      }
    } finally {
      await Promise.all(this.mcpClients.map(client => client.disconnect()));
    }
  }
}
