import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda";
import {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  isJSONRPCRequest,
  isJSONRPCResponse,
  isJSONRPCError,
  isJSONRPCNotification,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { createLogger, format, transports } from 'winston';

const logger = createLogger({
  level: process.env.LOG_LEVEL?.toLowerCase() || 'info',
  format: format.simple(),
  transports: [new transports.Console()],
});

/**
 * Interface for handling individual JSON-RPC requests
 */
export interface RequestHandler {
  /**
   * Process a single JSON-RPC request and return a response or error
   * @param request The JSON-RPC request to process
   * @param context The Lambda context
   * @returns A JSON-RPC response or error
   */
  handleRequest(
    request: JSONRPCRequest,
    context: Context
  ): Promise<JSONRPCResponse | JSONRPCError>;
}

/**
 * Generic handler for MCP Streamable HTTP protocol in Lambda functions
 *
 * This class handles all the generic JSON-RPC protocol aspects:
 * - HTTP method validation (POST, OPTIONS, GET)
 * - Content-Type and Accept header validation
 * - JSON parsing and validation
 * - Batch request handling
 * - CORS headers
 * - Error response formatting
 * This class does not implement session management.
 *
 * The specific business logic is delegated to a RequestHandler implementation.
 */
export class StreamableHttpHandler {
  constructor(private requestHandler: RequestHandler) {}

  /**
   * Main handler method that processes API Gateway V2 events.
   * Both API Gateway V2 (HTTP APIs) and Lambda function URLs use the API Gateway V2 events format.
   */
  async handle(
    event: APIGatewayProxyEventV2,
    context: Context
  ): Promise<APIGatewayProxyResultV2> {
    try {
      logger.debug("Incoming event:", JSON.stringify(event, null, 2));

      // Handle different HTTP methods according to MCP Streamable HTTP spec
      const httpMethod = event.requestContext.http.method;
      logger.debug("Detected HTTP method:", httpMethod);

      if (httpMethod === "OPTIONS") {
        // Handle CORS preflight
        return this.createCorsResponse();
      }

      if (httpMethod === "GET") {
        // No support for SSE streaming in Lambda functions
        // Return 405 Method Not Allowed as per spec
        return this.createErrorResponse(
          405,
          ErrorCode.ConnectionClosed,
          "Method Not Allowed: SSE streaming not supported",
          { Allow: "POST, OPTIONS" }
        );
      }

      if (httpMethod !== "POST") {
        return this.createErrorResponse(
          405,
          ErrorCode.ConnectionClosed,
          "Method Not Allowed",
          { Allow: "POST, OPTIONS" }
        );
      }

      // Validate Accept header for POST requests
      const acceptHeader = event.headers?.accept || event.headers?.Accept;
      if (!acceptHeader?.includes("application/json")) {
        return this.createErrorResponse(
          406,
          ErrorCode.ConnectionClosed,
          "Not Acceptable: Client must accept application/json"
        );
      }

      // Validate Content-Type header
      const contentType =
        event.headers?.["content-type"] || event.headers?.["Content-Type"];
      if (!contentType?.includes("application/json")) {
        return this.createErrorResponse(
          415,
          ErrorCode.ConnectionClosed,
          "Unsupported Media Type: Content-Type must be application/json"
        );
      }

      // Parse the request body according to MCP Streamable HTTP spec
      if (!event.body) {
        return this.createErrorResponse(
          400,
          ErrorCode.ParseError,
          "Parse error: Empty request body"
        );
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(event.body);
      } catch {
        return this.createErrorResponse(
          400,
          ErrorCode.ParseError,
          "Parse error: Invalid JSON"
        );
      }

      // Handle both single messages and batches according to MCP spec
      let messages: unknown[];
      if (Array.isArray(parsedBody)) {
        messages = parsedBody;
      } else {
        messages = [parsedBody];
      }

      // Validate that all messages are valid JSON-RPC using schema validation
      const validatedMessages: JSONRPCMessage[] = [];
      for (const message of messages) {
        if (
          isJSONRPCRequest(message) ||
          isJSONRPCResponse(message) ||
          isJSONRPCError(message) ||
          isJSONRPCNotification(message)
        ) {
          validatedMessages.push(message);
        } else {
          return this.createErrorResponse(
            400,
            ErrorCode.InvalidRequest,
            "Invalid Request: All messages must be valid JSON-RPC 2.0"
          );
        }
      }

      // Check if any message is a request (vs notification/response)
      const hasRequests = validatedMessages.some(isJSONRPCRequest);

      if (!hasRequests) {
        // If it only contains notifications or responses, return 202 Accepted
        return {
          statusCode: 202,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
          body: "",
        };
      }

      // Process requests - for Lambda, we'll process them sequentially and return JSON
      const responses: JSONRPCMessage[] = [];

      for (const message of validatedMessages) {
        if (isJSONRPCRequest(message)) {
          try {
            // Delegate to the specific request handler
            const response = await this.requestHandler.handleRequest(
              message,
              context
            );

            // The handler should return JSONRPCResponse or JSONRPCError for requests
            if (isJSONRPCResponse(response) || isJSONRPCError(response)) {
              responses.push(response);
            } else {
              // Unexpected response format - return internal server error
              logger.error(
                "Unexpected response format from request handler:",
                response
              );
              const errorResponse: JSONRPCError = {
                jsonrpc: "2.0",
                error: {
                  code: ErrorCode.InternalError,
                  message:
                    "Internal error: Unexpected response format from request handler",
                  data: "Expected JSONRPCResponse or JSONRPCError",
                },
                id: message.id,
              };
              responses.push(errorResponse);
            }
          } catch (error) {
            // Return JSON-RPC error response
            const errorResponse: JSONRPCError = {
              jsonrpc: "2.0",
              error: {
                code: ErrorCode.InternalError,
                message: "Internal error",
                data: error instanceof Error ? error.message : "Unknown error",
              },
              id: message.id,
            };
            responses.push(errorResponse);
          }
        }
      }

      // Prepare response headers
      const responseHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
      };

      // Return the response(s)
      const responseBody = responses.length === 1 ? responses[0] : responses;

      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify(responseBody),
      };
    } catch (error) {
      logger.error("Error processing MCP Streamable HTTP request:", error);

      return this.createErrorResponse(
        500,
        ErrorCode.InternalError,
        "Internal error",
        {},
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  /**
   * Create a CORS preflight response
   */
  private createCorsResponse(): APIGatewayProxyResultV2 {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
      },
      body: "",
    };
  }

  /**
   * Create an error response with proper CORS headers
   */
  private createErrorResponse(
    statusCode: number,
    errorCode: ErrorCode,
    message: string,
    additionalHeaders: Record<string, string> = {},
    data?: unknown
  ): APIGatewayProxyResultV2 {
    return {
      statusCode,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        ...additionalHeaders,
      },
      body: JSON.stringify(
        this.createJSONRPCErrorResponse(errorCode, message, data)
      ),
    };
  }

  /**
   * Helper function to create JSON-RPC error responses with no ID
   */
  private createJSONRPCErrorResponse(
    code: ErrorCode,
    message: string,
    data?: unknown
  ) {
    return {
      jsonrpc: "2.0" as const,
      error: {
        code,
        message,
        ...(data !== undefined && { data }),
      },
      id: null,
    };
  }
}
