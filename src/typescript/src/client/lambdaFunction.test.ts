import "aws-sdk-client-mock-jest";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import {
  LambdaFunctionClientTransport,
  LambdaFunctionParameters,
} from "./index.js";
import { Uint8ArrayBlobAdapter } from "@smithy/util-stream";
import { mockClient } from "aws-sdk-client-mock";

describe("LambdaFunctionClientTransport", () => {
  // Mock implementation of LambdaClient
  const lambdaMock = mockClient(LambdaClient);

  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    lambdaMock.reset();
  });

  describe("constructor", () => {
    test("should initialize client with provided region", async () => {
      const params: LambdaFunctionParameters = {
        functionName: "test-function",
        regionName: "not-a-region",
      };

      const message: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "test-method",
      };

      const transport = new LambdaFunctionClientTransport(params);

      lambdaMock.on(InvokeCommand).resolvesOnce({
        Payload: Uint8ArrayBlobAdapter.fromString(
          JSON.stringify({ result: "success" })
        ),
      });

      await transport.send(message);

      expect(await lambdaMock.call(0).thisValue.config.region()).toBe(
        "not-a-region"
      );
    });

    test("should use the default region", async () => {
      const originalRegion = process.env.AWS_REGION;
      process.env.AWS_REGION = "default-region";

      try {
        const params: LambdaFunctionParameters = {
          functionName: "test-function",
        };

        const message: JSONRPCMessage = {
          jsonrpc: "2.0",
          id: 1,
          method: "test-method",
        };

        const transport = new LambdaFunctionClientTransport(params);

        lambdaMock.on(InvokeCommand).resolvesOnce({
          Payload: Uint8ArrayBlobAdapter.fromString(
            JSON.stringify({ result: "success" })
          ),
        });

        await transport.send(message);

        expect(await lambdaMock.call(0).thisValue.config.region()).toBe(
          "default-region"
        );
      } finally {
        process.env.AWS_REGION = originalRegion;
      }
    });
  });

  describe("start and close methods", () => {
    test("start method should be a no-op", async () => {
      const params: LambdaFunctionParameters = {
        functionName: "test-function",
      };

      const transport = new LambdaFunctionClientTransport(params);
      await expect(transport.start()).resolves.toBeUndefined();
    });

    test("close method should be a no-op", async () => {
      const params: LambdaFunctionParameters = {
        functionName: "test-function",
      };

      const transport = new LambdaFunctionClientTransport(params);
      await expect(transport.close()).resolves.toBeUndefined();
    });
  });

  describe("send method", () => {
    test("should invoke Lambda function with correct parameters", async () => {
      const params: LambdaFunctionParameters = {
        functionName: "test-function",
      };

      const message: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "test-method",
      };

      const transport = new LambdaFunctionClientTransport(params);

      lambdaMock.on(InvokeCommand).resolvesOnce({
        Payload: Uint8ArrayBlobAdapter.fromString(
          JSON.stringify({ result: "success" })
        ),
      });

      await transport.send(message);

      expect(lambdaMock).toHaveReceivedCommandTimes(InvokeCommand, 1);
      expect(lambdaMock).toHaveReceivedCommandWith(InvokeCommand, {
        FunctionName: "test-function",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify(message),
      });
    });

    test("should call onmessage with parsed response", async () => {
      const params: LambdaFunctionParameters = {
        functionName: "test-function",
      };

      const message: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "test-method",
      };

      const responsePayload = {
        jsonrpc: "2.0",
        id: 1,
        result: { data: "test-data" },
      };

      const transport = new LambdaFunctionClientTransport(params);
      const onMessageMock = jest.fn();
      transport.onmessage = onMessageMock;

      lambdaMock.on(InvokeCommand).resolvesOnce({
        Payload: Uint8ArrayBlobAdapter.fromString(
          JSON.stringify(responsePayload)
        ),
      });

      await transport.send(message);

      expect(onMessageMock).toHaveBeenCalledTimes(1);
      expect(onMessageMock).toHaveBeenCalledWith(responsePayload);
    });

    test("should not call onmessage for empty response", async () => {
      const params: LambdaFunctionParameters = {
        functionName: "test-function",
      };

      const message: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "notification",
      };

      const transport = new LambdaFunctionClientTransport(params);
      const onMessageMock = jest.fn();
      transport.onmessage = onMessageMock;

      lambdaMock.on(InvokeCommand).resolvesOnce({
        Payload: Uint8ArrayBlobAdapter.fromString("{}"),
      });

      await transport.send(message);

      expect(onMessageMock).not.toHaveBeenCalled();
    });

    test("should throw error when Lambda function returns an error", async () => {
      const params: LambdaFunctionParameters = {
        functionName: "test-function",
      };

      const message: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "test-method",
      };

      const transport = new LambdaFunctionClientTransport(params);
      const onErrorMock = jest.fn();
      transport.onerror = onErrorMock;

      lambdaMock.on(InvokeCommand).resolvesOnce({
        FunctionError: "Unhandled",
        Payload: Uint8ArrayBlobAdapter.fromString("Error executing function"),
      });

      await transport.send(message);

      expect(onErrorMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock.mock.calls[0][0].message).toBe(
        "Unhandled Error executing function"
      );
    });

    test("should call onerror when Lambda client throws an error", async () => {
      const params: LambdaFunctionParameters = {
        functionName: "test-function",
      };

      const message: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "test-method",
      };

      const transport = new LambdaFunctionClientTransport(params);
      const onErrorMock = jest.fn();
      transport.onerror = onErrorMock;

      const error = new Error("Network error");
      lambdaMock.rejects(error);

      await transport.send(message);

      expect(onErrorMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledWith(error);
    });

    test("should handle case when no Payload is returned", async () => {
      const params: LambdaFunctionParameters = {
        functionName: "test-function",
      };

      const message: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "test-method",
      };

      const transport = new LambdaFunctionClientTransport(params);
      const onErrorMock = jest.fn();
      transport.onerror = onErrorMock;

      lambdaMock.on(InvokeCommand).resolvesOnce({});

      await transport.send(message);

      expect(onErrorMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledWith(
        new Error("No payload returned from Lambda function")
      );
    });
  });
});
