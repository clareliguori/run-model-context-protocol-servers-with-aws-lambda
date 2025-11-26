import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import * as fs from "fs";

/**
 * Manages configuration for the MCP client and the Bedrock client.
 */
export class Configuration {
  modelId: string;
  region: string;

  /**
   * Initialize configuration.
   */
  constructor(
    modelId: string = "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    region: string = "us-west-2"
  ) {
    this.modelId = modelId;
    this.region = region;
  }

  /**
   * Load server configuration from JSON file.
   * @param filePath Path to the JSON configuration file.
   * @returns Dict containing server configuration.
   * @throws Error if configuration file doesn't exist or is invalid JSON.
   */
  static loadConfig(filePath: string): Record<string, any> {
    try {
      const fileContent = fs.readFileSync(filePath, "utf8");
      return JSON.parse(fileContent);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Configuration file not found: ${filePath}`);
      } else {
        throw new Error(`Error parsing configuration file: ${e}`);
      }
    }
  }

  /**
   * Get a Bedrock runtime client.
   * @returns The Bedrock client.
   */
  get bedrockClient(): BedrockRuntimeClient {
    return new BedrockRuntimeClient({
      region: this.region,
      retryMode: "standard",
      maxAttempts: 10,
    });
  }
}
