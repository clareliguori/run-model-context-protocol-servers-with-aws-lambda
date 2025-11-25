import * as readline from "readline-sync";
import { Agent, McpClient } from "@strands-agents/sdk";
import logger from "./logger.js";

export class ChatSession {
  private agent: Agent;
  private mcpClients: McpClient[];

  constructor(agent: Agent, mcpClients: McpClient[]) {
    this.agent = agent;
    this.mcpClients = mcpClients;
  }

  async start(): Promise<void> {
    console.log(
      "Chat with the assistant (type 'quit', 'exit', '/quit', or '/exit' to stop)"
    );
    while (true) {
      const userInput = readline.question("\n\nYou: ").trim();
      if (
        userInput.toLowerCase() === "quit" ||
        userInput.toLowerCase() === "exit" ||
        userInput === "/quit" ||
        userInput === "/exit"
      ) {
        logger.info("\nExiting...");
        await Promise.all(this.mcpClients.map(client => client.disconnect()));
        break;
      }

      if (!userInput) {
        continue;
      }

      try {
        process.stdout.write("\nAssistant: ");
        await this.agent.invoke(userInput);
      } catch (error) {
        logger.error(`Error: ${error}`);
      }
    }
  }
}
