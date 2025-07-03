import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from "aws-lambda";
import {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  JSONRPCNotification,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import {
  StreamableHttpHandler,
  RequestHandler,
} from "./streamable_http_handler.js";

// Mock RequestHandler implementation for testing
class MockRequestHandler implements RequestHandler {
  private responses: Map<string, JSONRPCResponse | JSONRPCError> = new Map();
  private shouldThrow = false;

  setResponse(method: string, response: JSONRPCResponse | JSONRPCError) {
    this.responses.set(method, response);
  }

  setShouldThrow(shouldThrow: boolean) {
    this.shouldThrow = shouldThrow;
  }

  async handleRequest(
    request: JSONRPCRequest,
    _context: Context
  ): Promise<JSONRPCResponse | JSONRPCError> {
    if (this.shouldThrow) {
      throw new Error("Mock handler error");
    }

    const response = this.responses.get(request.method);
    if (!response) {
      return {
        jsonrpc: "2.0",
        error: {
          code: ErrorCode.MethodNotFound,
          message: "Method not found",
        },
        id: request.id,
      };
    }

    return response;
  }
}

const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: true,
  functionName: "test-function",
  functionVersion: "1",
  invokedFunctionArn: "test-arn",
  memoryLimitInMB: "128",
  awsRequestId: "test-id",
  logGroupName: "test-group",
  logStreamName: "test-stream",
  getRemainingTimeInMillis: () => 1000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

function createMockEvent(
  method: string = "POST",
  body?: string,
  headers: Record<string, string | undefined> = {}
): APIGatewayProxyEventV2 {
  const defaultHeaders: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };

  // Filter out undefined values and merge with defaults
  const filteredHeaders = Object.fromEntries(
    Object.entries(headers).filter(([_, value]) => value !== undefined)
  ) as Record<string, string>;

  // If a header is explicitly set to undefined, remove it from defaults
  const finalHeaders = { ...defaultHeaders };
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      delete finalHeaders[key];
    } else {
      finalHeaders[key] = value;
    }
  }

  // Add any additional headers that weren't in defaults
  for (const [key, value] of Object.entries(filteredHeaders)) {
    if (!(key in defaultHeaders)) {
      finalHeaders[key] = value;
    }
  }

  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: "/",
    rawQueryString: "",
    headers: finalHeaders,
    requestContext: {
      accountId: "123456789012",
      apiId: "api-id",
      domainName: "example.com",
      domainPrefix: "api",
      http: {
        method,
        path: "/",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test-agent",
      },
      requestId: "request-id",
      routeKey: "$default",
      stage: "$default",
      time: "01/Jan/2023:00:00:00 +0000",
      timeEpoch: 1672531200,
    },
    body,
    isBase64Encoded: false,
  };
}

// Helper function to cast APIGatewayProxyResultV2 to structured result
function asStructuredResult(
  result: APIGatewayProxyResultV2
): APIGatewayProxyStructuredResultV2 {
  return result as APIGatewayProxyStructuredResultV2;
}

describe("StreamableHttpHandler", () => {
  let handler: StreamableHttpHandler;
  let mockRequestHandler: MockRequestHandler;

  beforeEach(() => {
    mockRequestHandler = new MockRequestHandler();
    handler = new StreamableHttpHandler(mockRequestHandler);
  });

  describe("OPTIONS requests (CORS preflight)", () => {
    test("should handle OPTIONS request with proper CORS headers", async () => {
      const event = createMockEvent("OPTIONS");

      const result = await handler.handle(event, mockContext);

      expect(result).toEqual({
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
        },
        body: "",
      });
    });
  });

  describe("GET requests", () => {
    test("should return 405 Method Not Allowed for GET requests", async () => {
      const event = createMockEvent("GET");

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(405);
      expect(structuredResult.headers).toMatchObject({
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        Allow: "POST, OPTIONS",
      });

      const body = JSON.parse(structuredResult.body!);
      expect(body).toEqual({
        jsonrpc: "2.0",
        error: {
          code: ErrorCode.ConnectionClosed,
          message: "Method Not Allowed: SSE streaming not supported",
        },
        id: null,
      });
    });
  });

  describe("Unsupported HTTP methods", () => {
    test("should return 405 Method Not Allowed for PUT requests", async () => {
      const event = createMockEvent("PUT");

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(405);
      expect(structuredResult.headers).toMatchObject({
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        Allow: "POST, OPTIONS",
      });

      const body = JSON.parse(structuredResult.body!);
      expect(body).toEqual({
        jsonrpc: "2.0",
        error: {
          code: ErrorCode.ConnectionClosed,
          message: "Method Not Allowed",
        },
        id: null,
      });
    });
  });

  describe("Header validation", () => {
    test("should return 406 Not Acceptable when Accept header is missing", async () => {
      const event = createMockEvent("POST", "{}", { accept: undefined });

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(406);
      const body = JSON.parse(structuredResult.body!);
      expect(body).toEqual({
        jsonrpc: "2.0",
        error: {
          code: ErrorCode.ConnectionClosed,
          message: "Not Acceptable: Client must accept application/json",
        },
        id: null,
      });
    });

    test("should return 406 Not Acceptable when Accept header does not include application/json", async () => {
      const event = createMockEvent("POST", "{}", { accept: "text/html" });

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(406);
    });

    test("should return 415 Unsupported Media Type when Content-Type is missing", async () => {
      const event = createMockEvent("POST", "{}", {
        "content-type": undefined,
      });

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(415);
      const body = JSON.parse(structuredResult.body!);
      expect(body).toEqual({
        jsonrpc: "2.0",
        error: {
          code: ErrorCode.ConnectionClosed,
          message:
            "Unsupported Media Type: Content-Type must be application/json",
        },
        id: null,
      });
    });

    test("should return 415 Unsupported Media Type when Content-Type is not application/json", async () => {
      const event = createMockEvent("POST", "{}", {
        "content-type": "text/plain",
      });

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(415);
    });

    test("should accept case-insensitive headers", async () => {
      const request: JSONRPCRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "test",
      };

      const expectedResponse: JSONRPCResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: { success: true },
      };

      mockRequestHandler.setResponse("test", expectedResponse);

      const event = createMockEvent("POST", JSON.stringify(request), {
        "Content-Type": "application/json",
        Accept: "application/json",
      });

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(200);
    });
  });

  describe("Request body validation", () => {
    test("should return 400 Parse Error when body is empty", async () => {
      const event = createMockEvent("POST");

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(400);
      const body = JSON.parse(structuredResult.body!);
      expect(body).toEqual({
        jsonrpc: "2.0",
        error: {
          code: ErrorCode.ParseError,
          message: "Parse error: Empty request body",
        },
        id: null,
      });
    });

    test("should return 400 Parse Error when body is invalid JSON", async () => {
      const event = createMockEvent("POST", "invalid json");

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(400);
      const body = JSON.parse(structuredResult.body!);
      expect(body).toEqual({
        jsonrpc: "2.0",
        error: {
          code: ErrorCode.ParseError,
          message: "Parse error: Invalid JSON",
        },
        id: null,
      });
    });

    test("should return 400 Invalid Request when message is not valid JSON-RPC", async () => {
      const invalidMessage = { invalid: "message" };
      const event = createMockEvent("POST", JSON.stringify(invalidMessage));

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(400);
      const body = JSON.parse(structuredResult.body!);
      expect(body).toEqual({
        jsonrpc: "2.0",
        error: {
          code: ErrorCode.InvalidRequest,
          message: "Invalid Request: All messages must be valid JSON-RPC 2.0",
        },
        id: null,
      });
    });
  });

  describe("Single request handling", () => {
    test("should handle valid JSON-RPC request and return response", async () => {
      const request: JSONRPCRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "test",
        params: { arg: "value" },
      };

      const expectedResponse: JSONRPCResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: { success: true },
      };

      mockRequestHandler.setResponse("test", expectedResponse);

      const event = createMockEvent("POST", JSON.stringify(request));

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(200);
      expect(structuredResult.headers).toMatchObject({
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
      });

      const body = JSON.parse(structuredResult.body!);
      expect(body).toEqual(expectedResponse);
    });

    test("should handle JSON-RPC error response from handler", async () => {
      const request: JSONRPCRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "test",
      };

      const expectedError: JSONRPCError = {
        jsonrpc: "2.0",
        error: {
          code: ErrorCode.MethodNotFound,
          message: "Method not found",
        },
        id: 1,
      };

      mockRequestHandler.setResponse("test", expectedError);

      const event = createMockEvent("POST", JSON.stringify(request));

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(200);
      const body = JSON.parse(structuredResult.body!);
      expect(body).toEqual(expectedError);
    });

    test("should handle exception thrown by request handler", async () => {
      const request: JSONRPCRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "test",
      };

      mockRequestHandler.setShouldThrow(true);

      const event = createMockEvent("POST", JSON.stringify(request));

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(200);
      const body = JSON.parse(structuredResult.body!);
      expect(body).toEqual({
        jsonrpc: "2.0",
        error: {
          code: ErrorCode.InternalError,
          message: "Internal error",
          data: "Mock handler error",
        },
        id: 1,
      });
    });
  });

  describe("Batch request handling", () => {
    test("should handle batch of requests", async () => {
      const requests: JSONRPCRequest[] = [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "test1",
        },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "test2",
        },
      ];

      const expectedResponses: JSONRPCResponse[] = [
        {
          jsonrpc: "2.0",
          id: 1,
          result: { success: true },
        },
        {
          jsonrpc: "2.0",
          id: 2,
          result: { success: true },
        },
      ];

      mockRequestHandler.setResponse("test1", expectedResponses[0]);
      mockRequestHandler.setResponse("test2", expectedResponses[1]);

      const event = createMockEvent("POST", JSON.stringify(requests));

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(200);
      const body = JSON.parse(structuredResult.body!);
      expect(body).toEqual(expectedResponses);
    });

    test("should handle mixed batch with requests and notifications", async () => {
      const messages = [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "test",
        },
        {
          jsonrpc: "2.0",
          method: "notification",
        },
      ];

      const expectedResponse: JSONRPCResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: { success: true },
      };

      mockRequestHandler.setResponse("test", expectedResponse);

      const event = createMockEvent("POST", JSON.stringify(messages));

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(200);
      const body = JSON.parse(structuredResult.body!);
      // Current implementation returns single response when there's only one response
      expect(body).toEqual(expectedResponse);
    });
  });

  describe("Notification handling", () => {
    test("should return 202 Accepted for notification only", async () => {
      const notification: JSONRPCNotification = {
        jsonrpc: "2.0",
        method: "notification",
      };

      const event = createMockEvent("POST", JSON.stringify(notification));

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(202);
      expect(structuredResult.headers).toMatchObject({
        "Access-Control-Allow-Origin": "*",
      });
      expect(structuredResult.body).toBe("");
    });

    test("should return 202 Accepted for batch of notifications only", async () => {
      const notifications: JSONRPCNotification[] = [
        {
          jsonrpc: "2.0",
          method: "notification1",
        },
        {
          jsonrpc: "2.0",
          method: "notification2",
        },
      ];

      const event = createMockEvent("POST", JSON.stringify(notifications));

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(202);
      expect(structuredResult.body).toBe("");
    });
  });

  describe("Error handling", () => {
    test("should handle unexpected response format from request handler", async () => {
      const request: JSONRPCRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "test",
      };

      // Mock handler that returns invalid response format
      const invalidHandler: RequestHandler = {
        async handleRequest() {
          return { invalid: "response" } as unknown as JSONRPCResponse;
        },
      };

      const invalidHandlerInstance = new StreamableHttpHandler(invalidHandler);
      const event = createMockEvent("POST", JSON.stringify(request));

      const result = await invalidHandlerInstance.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(200);
      const body = JSON.parse(structuredResult.body!);
      expect(body).toEqual({
        jsonrpc: "2.0",
        error: {
          code: ErrorCode.InternalError,
          message:
            "Internal error: Unexpected response format from request handler",
          data: "Expected JSONRPCResponse or JSONRPCError",
        },
        id: 1,
      });
    });

    test("should handle general exceptions in main handler", async () => {
      // Create an event that will cause an exception in the main handler
      const event = {
        ...createMockEvent("POST", "{}"),
        requestContext:
          null as unknown as APIGatewayProxyEventV2["requestContext"], // This will cause an exception
      };

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      expect(structuredResult.statusCode).toBe(500);
      const body = JSON.parse(structuredResult.body!);
      expect(body).toEqual({
        jsonrpc: "2.0",
        error: {
          code: ErrorCode.InternalError,
          message: "Internal error",
          data: expect.any(String),
        },
        id: null,
      });
    });
  });

  describe("Response format", () => {
    test("should return single response for single request", async () => {
      const request: JSONRPCRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "test",
      };

      const expectedResponse: JSONRPCResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: { success: true },
      };

      mockRequestHandler.setResponse("test", expectedResponse);

      const event = createMockEvent("POST", JSON.stringify(request));

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      const body = JSON.parse(structuredResult.body!);
      expect(Array.isArray(body)).toBe(false);
      expect(body).toEqual(expectedResponse);
    });

    test("should return array for batch requests", async () => {
      const requests: JSONRPCRequest[] = [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "test1",
        },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "test2",
        },
      ];

      const expectedResponses: JSONRPCResponse[] = [
        {
          jsonrpc: "2.0",
          id: 1,
          result: { success: true },
        },
        {
          jsonrpc: "2.0",
          id: 2,
          result: { success: true },
        },
      ];

      mockRequestHandler.setResponse("test1", expectedResponses[0]);
      mockRequestHandler.setResponse("test2", expectedResponses[1]);

      const event = createMockEvent("POST", JSON.stringify(requests));

      const result = await handler.handle(event, mockContext);
      const structuredResult = asStructuredResult(result);

      const body = JSON.parse(structuredResult.body!);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toEqual(expectedResponses);
    });
  });
});
