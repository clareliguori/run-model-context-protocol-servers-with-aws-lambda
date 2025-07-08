import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export type LambdaFunctionParameters = {
  /**
   * The name or ARN of the Lambda function, version, or alias.
   */
  functionName: string;

  /**
   * The AWS region of the Lambda function.
   */
  regionName?: string;
};

/**
 * Client transport for Lambda functions:
 * this will connect to a server by calling the Lambda Invoke API.
 */
export class LambdaFunctionClientTransport implements Transport {
  private _serverParams: LambdaFunctionParameters;
  private _lambdaClient: LambdaClient;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(server: LambdaFunctionParameters) {
    this._serverParams = server;
    this._lambdaClient = new LambdaClient({
      region: this._serverParams.regionName,
    });
  }

  async start(): Promise<void> {
    // no-op
  }

  async close(): Promise<void> {
    // no-op
  }

  async send(message: JSONRPCMessage): Promise<void> {
    try {
      const invokeCommand = new InvokeCommand({
        FunctionName: this._serverParams.functionName,
        InvocationType: "RequestResponse",
        Payload: JSON.stringify(message),
      });
      const invokeCommandOutput = await this._lambdaClient.send(invokeCommand);

      if (invokeCommandOutput.Payload) {
        const responseMessage = Buffer.from(
          invokeCommandOutput.Payload
        ).toString("utf-8");

        if (invokeCommandOutput.FunctionError) {
          throw new Error(
            `${invokeCommandOutput.FunctionError} ${responseMessage}`
          );
        }

        if (responseMessage === "{}") {
          // Assume we sent a notification and do not expect a response
          return;
        }

        this.onmessage?.(JSON.parse(responseMessage));
      } else {
        throw new Error("No payload returned from Lambda function");
      }
    } catch (error) {
      this.onerror?.(error as Error);
    }
  }
}
