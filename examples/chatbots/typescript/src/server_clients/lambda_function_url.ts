import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { StreamableHTTPClientWithSigV4Transport } from "@aws/run-mcp-servers-with-aws-lambda";
import { Server } from "./server.js";
import logger from "../logger.js";

/**
 * Configuration for LambdaFunctionUrlClient
 */
export interface LambdaFunctionUrlConfig {
  /**
   * Direct Lambda function URL (if provided, stackName should not be used)
   */
  functionUrl?: string;

  /**
   * CloudFormation stack name to lookup function URL from (if provided, functionUrl should not be used)
   */
  stackName?: string;

  /**
   * CloudFormation stack output key for the function URL (default: "FunctionUrl")
   */
  stackUrlOutputKey?: string;

  /**
   * AWS region (default: "us-west-2")
   */
  region?: string;
}

/**
 * Manages MCP server connections and tool execution for servers running behind
 * Lambda function URLs with AWS SigV4 authentication.
 *
 * This client can lookup the function URL from a CloudFormation stack output
 * instead of requiring the user to statically configure the URL.
 */
export class LambdaFunctionUrlClient extends Server {
  private lambdaConfig: Required<LambdaFunctionUrlConfig>;

  constructor(name: string, config: LambdaFunctionUrlConfig) {
    // Set defaults and convert to required config
    const fullConfig: Required<LambdaFunctionUrlConfig> = {
      functionUrl: config.functionUrl || "",
      stackName: config.stackName || "",
      stackUrlOutputKey: config.stackUrlOutputKey || "FunctionUrl",
      region: config.region || "us-west-2",
    };

    super(name, fullConfig);
    this.lambdaConfig = fullConfig;

    if (!fullConfig.functionUrl && !fullConfig.stackName) {
      throw new Error(
        "Either functionUrl must be provided or stackName must be provided for CloudFormation lookup"
      );
    }

    if (fullConfig.functionUrl && fullConfig.stackName) {
      throw new Error("Only one of functionUrl or stackName can be provided");
    }
  }

  /**
   * Initialize the server connection with AWS SigV4 authentication.
   * @throws Error if initialization parameters are invalid
   * @throws Error if server fails to initialize
   */
  async initialize(): Promise<void> {
    try {
      // Determine the function URL
      let functionUrl = this.lambdaConfig.functionUrl;
      if (this.lambdaConfig.stackName) {
        logger.debug("Retrieving function URL from CloudFormation...");
        functionUrl = await this._getFunctionUrlFromCloudFormation();
        // Update the config with the resolved URL
        this.lambdaConfig.functionUrl = functionUrl;
      }

      if (!functionUrl) {
        throw new Error(
          "The functionUrl must be a valid string and cannot be undefined."
        );
      }

      logger.debug(`Connecting to Lambda function URL: ${functionUrl}`);

      const transport = new StreamableHTTPClientWithSigV4Transport(
        new URL(functionUrl),
        {
          service: "lambda",
          region: this.lambdaConfig.region,
        }
      );

      await this.client.connect(transport);
      logger.debug("MCP session initialized successfully");
    } catch (error) {
      logger.error(
        `Error initializing Lambda function URL client ${this.name}: ${error}`
      );
      throw error;
    }
  }

  /**
   * Retrieve the Lambda function URL from CloudFormation stack outputs.
   */
  private async _getFunctionUrlFromCloudFormation(): Promise<string> {
    try {
      logger.debug(
        `Retrieving function URL from CloudFormation stack: ${this.lambdaConfig.stackName}`
      );

      const cfClient = new CloudFormationClient({
        region: this.lambdaConfig.region,
      });

      const command = new DescribeStacksCommand({
        StackName: this.lambdaConfig.stackName,
      });

      const response = await cfClient.send(command);

      if (!response.Stacks || response.Stacks.length === 0) {
        throw new Error(
          `CloudFormation stack '${this.lambdaConfig.stackName}' not found`
        );
      }

      const stack = response.Stacks[0];
      if (!stack.Outputs) {
        throw new Error(
          `No outputs found in CloudFormation stack '${this.lambdaConfig.stackName}'`
        );
      }

      const functionUrlOutput = stack.Outputs.find(
        (output) => output.OutputKey === this.lambdaConfig.stackUrlOutputKey
      );

      if (!functionUrlOutput || !functionUrlOutput.OutputValue) {
        throw new Error(
          `Function URL output not found in CloudFormation stack. Output key: ${this.lambdaConfig.stackUrlOutputKey}`
        );
      }

      const functionUrl = functionUrlOutput.OutputValue;
      logger.debug(`Retrieved function URL: ${functionUrl}`);
      return functionUrl;
    } catch (error: any) {
      if (error.name === "ValidationException") {
        throw new Error(
          `CloudFormation stack '${this.lambdaConfig.stackName}' does not exist or is not accessible`
        );
      } else if (
        error.name === "AccessDenied" ||
        error.name === "UnauthorizedOperation"
      ) {
        throw new Error(
          `Insufficient permissions to access CloudFormation stack '${this.lambdaConfig.stackName}'. ` +
            "Ensure your AWS credentials have cloudformation:DescribeStacks permission."
        );
      } else {
        logger.error(
          "Failed to retrieve function URL from CloudFormation:",
          error
        );
        throw new Error(
          `Could not retrieve function URL from CloudFormation stack ${this.lambdaConfig.stackName}: ${error.message}`
        );
      }
    }
  }
}
