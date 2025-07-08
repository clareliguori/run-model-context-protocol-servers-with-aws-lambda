import { SignatureV4 } from "@smithy/signature-v4";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { AwsCredentialIdentity } from "@aws-sdk/types";
import {
  StreamableHTTPClientWithSigV4Transport,
  StreamableHTTPClientWithSigV4TransportOptions,
  SigV4FetchLike,
  SigV4FetchLikeOptions,
  createSigV4Fetch,
} from "./streamableHttpWithSigV4.js";

// Mock dependencies
jest.mock("@smithy/signature-v4");
jest.mock("@aws-sdk/credential-provider-node");
jest.mock("@aws-sdk/protocol-http");
jest.mock("@modelcontextprotocol/sdk/client/streamableHttp.js");

describe("StreamableHTTPClientWithSigV4Transport", () => {
  const mockSign = jest.fn();
  const mockDefaultProvider = jest.fn();
  const mockCredentials: AwsCredentialIdentity = {
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock SignatureV4
    (SignatureV4 as jest.MockedClass<typeof SignatureV4>).mockImplementation(
      () =>
        ({
          sign: mockSign,
        } as any)
    );

    // Mock defaultProvider
    (
      defaultProvider as jest.MockedFunction<typeof defaultProvider>
    ).mockReturnValue(mockDefaultProvider);
    mockDefaultProvider.mockResolvedValue(mockCredentials);
  });

  describe("constructor", () => {
    test("should initialize with required options", () => {
      const url = new URL("https://example.com/mcp");
      const options: StreamableHTTPClientWithSigV4TransportOptions = {
        region: "us-east-1",
        service: "lambda",
      };

      new StreamableHTTPClientWithSigV4Transport(url, options);

      expect(SignatureV4).toHaveBeenCalledWith({
        service: "lambda",
        region: "us-east-1",
        credentials: mockDefaultProvider,
        sha256: expect.any(Function),
      });
    });

    test("should use provided credentials instead of default provider", () => {
      const url = new URL("https://example.com/mcp");
      const customCredentials: AwsCredentialIdentity = {
        accessKeyId: "custom-access-key",
        secretAccessKey: "custom-secret-key",
      };
      const options: StreamableHTTPClientWithSigV4TransportOptions = {
        region: "us-west-2",
        service: "execute-api",
        credentials: customCredentials,
      };

      new StreamableHTTPClientWithSigV4Transport(url, options);

      expect(SignatureV4).toHaveBeenCalledWith({
        service: "execute-api",
        region: "us-west-2",
        credentials: customCredentials,
        sha256: expect.any(Function),
      });
      expect(defaultProvider).not.toHaveBeenCalled();
    });

    test("should use provided fetch function", () => {
      const url = new URL("https://example.com/mcp");
      const customFetch = jest.fn();
      const options: StreamableHTTPClientWithSigV4TransportOptions = {
        region: "us-east-1",
        service: "lambda",
        fetch: customFetch,
      };

      new StreamableHTTPClientWithSigV4Transport(url, options);

      // The custom fetch should be passed to the SigV4FetchLike as baseFetch
      expect(customFetch).not.toHaveBeenCalled();
    });
  });

  describe("SigV4FetchLike", () => {
    let mockFetch: jest.MockedFunction<typeof fetch>;

    beforeEach(() => {
      mockFetch = jest.fn();
    });

    it("should sign and execute GET request", async () => {
      const testUrl = "https://example.com/test";
      const signedHeaders = {
        authorization: "AWS4-HMAC-SHA256 ...",
        "x-amz-date": "20231201T120000Z",
      };

      mockSign.mockResolvedValue({
        method: "GET",
        headers: signedHeaders,
        body: undefined,
      });

      const mockResponse = new Response("test response");
      mockFetch.mockResolvedValue(mockResponse);

      const options: SigV4FetchLikeOptions = {
        region: "us-east-1",
        service: "lambda",
        baseFetch: mockFetch,
      };
      const sigV4Fetch = new SigV4FetchLike(options);

      const result = await sigV4Fetch.fetch(testUrl, undefined);

      expect(HttpRequest).toHaveBeenCalledWith({
        method: "GET",
        protocol: "https:",
        hostname: "example.com",
        path: "/test",
        headers: {
          host: "example.com",
        },
        body: undefined,
      });

      expect(mockSign).toHaveBeenCalledWith(expect.any(HttpRequest));
      expect(mockFetch).toHaveBeenCalledWith(new URL(testUrl), {
        method: "GET",
        headers: signedHeaders,
        body: undefined,
      });
      expect(result).toBe(mockResponse);
    });

    it("should sign and execute POST request with body", async () => {
      const testUrl = "https://example.com/api";
      const requestInit: RequestInit = {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ test: "data" }),
      };

      const signedHeaders = {
        authorization: "AWS4-HMAC-SHA256 ...",
        "x-amz-date": "20231201T120000Z",
        "content-type": "application/json",
      };

      mockSign.mockResolvedValue({
        method: "POST",
        headers: signedHeaders,
        body: requestInit.body,
      });

      const mockResponse = new Response("success");
      mockFetch.mockResolvedValue(mockResponse);

      const options: SigV4FetchLikeOptions = {
        region: "us-east-1",
        service: "lambda",
        baseFetch: mockFetch,
      };
      const sigV4Fetch = new SigV4FetchLike(options);

      const result = await sigV4Fetch.fetch(testUrl, requestInit);

      expect(HttpRequest).toHaveBeenCalledWith({
        method: "POST",
        protocol: "https:",
        hostname: "example.com",
        path: "/api",
        headers: {
          host: "example.com",
          "content-type": "application/json",
        },
        body: requestInit.body,
      });

      expect(mockSign).toHaveBeenCalledWith(expect.any(HttpRequest));
      expect(mockFetch).toHaveBeenCalledWith(new URL(testUrl), {
        method: "POST",
        headers: signedHeaders,
        body: requestInit.body,
      });
      expect(result).toBe(mockResponse);
    });

    it("should handle URL with port and query parameters", async () => {
      const testUrl = "https://example.com:8443/path?param=value";

      mockSign.mockResolvedValue({
        method: "GET",
        headers: { authorization: "AWS4-HMAC-SHA256 ..." },
        body: undefined,
      });

      mockFetch.mockResolvedValue(new Response("test"));

      const options: SigV4FetchLikeOptions = {
        region: "us-east-1",
        service: "lambda",
        baseFetch: mockFetch,
      };
      const sigV4Fetch = new SigV4FetchLike(options);

      await sigV4Fetch.fetch(testUrl, undefined);

      expect(HttpRequest).toHaveBeenCalledWith({
        method: "GET",
        protocol: "https:",
        hostname: "example.com",
        port: 8443,
        path: "/path?param=value",
        headers: {
          host: "example.com",
        },
        body: undefined,
      });
    });

    it("should handle Headers object in request init", async () => {
      const testUrl = "https://example.com/test";
      const headers = new Headers();
      headers.set("Content-Type", "application/json");
      headers.set("X-Custom-Header", "custom-value");

      const requestInit: RequestInit = {
        method: "POST",
        headers,
        body: "test body",
      };

      mockSign.mockResolvedValue({
        method: "POST",
        headers: { authorization: "AWS4-HMAC-SHA256 ..." },
        body: "test body",
      });

      mockFetch.mockResolvedValue(new Response("test"));

      const options: SigV4FetchLikeOptions = {
        region: "us-east-1",
        service: "lambda",
        baseFetch: mockFetch,
      };
      const sigV4Fetch = new SigV4FetchLike(options);

      await sigV4Fetch.fetch(testUrl, requestInit);

      expect(HttpRequest).toHaveBeenCalledWith({
        method: "POST",
        protocol: "https:",
        hostname: "example.com",
        path: "/test",
        headers: {
          host: "example.com",
          "content-type": "application/json",
          "x-custom-header": "custom-value",
        },
        body: "test body",
      });
    });

    it("should handle array headers in request init", async () => {
      const testUrl = "https://example.com/test";
      const requestInit: RequestInit = {
        method: "POST",
        headers: [
          ["Content-Type", "application/json"],
          ["X-Custom-Header", "custom-value"],
        ],
        body: "test body",
      };

      mockSign.mockResolvedValue({
        method: "POST",
        headers: { authorization: "AWS4-HMAC-SHA256 ..." },
        body: "test body",
      });

      mockFetch.mockResolvedValue(new Response("test"));

      const options: SigV4FetchLikeOptions = {
        region: "us-east-1",
        service: "lambda",
        baseFetch: mockFetch,
      };
      const sigV4Fetch = new SigV4FetchLike(options);

      await sigV4Fetch.fetch(testUrl, requestInit);

      expect(HttpRequest).toHaveBeenCalledWith({
        method: "POST",
        protocol: "https:",
        hostname: "example.com",
        path: "/test",
        headers: {
          host: "example.com",
          "content-type": "application/json",
          "x-custom-header": "custom-value",
        },
        body: "test body",
      });
    });

    it("should handle URL object as input", async () => {
      const testUrl = new URL("https://example.com/test");

      mockSign.mockResolvedValue({
        method: "GET",
        headers: { authorization: "AWS4-HMAC-SHA256 ..." },
        body: undefined,
      });

      mockFetch.mockResolvedValue(new Response("test"));

      const options: SigV4FetchLikeOptions = {
        region: "us-east-1",
        service: "lambda",
        baseFetch: mockFetch,
      };
      const sigV4Fetch = new SigV4FetchLike(options);

      await sigV4Fetch.fetch(testUrl, undefined);

      expect(HttpRequest).toHaveBeenCalledWith({
        method: "GET",
        protocol: "https:",
        hostname: "example.com",
        path: "/test",
        headers: {
          host: "example.com",
        },
        body: undefined,
      });
    });

    it("should propagate signing errors", async () => {
      const testUrl = "https://example.com/test";
      mockSign.mockRejectedValue(new Error("Signing failed"));

      const options: SigV4FetchLikeOptions = {
        region: "us-east-1",
        service: "lambda",
        baseFetch: mockFetch,
      };
      const sigV4Fetch = new SigV4FetchLike(options);

      await expect(sigV4Fetch.fetch(testUrl, undefined)).rejects.toThrow(
        "Signing failed"
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should propagate fetch errors", async () => {
      const testUrl = "https://example.com/test";
      mockSign.mockResolvedValue({
        method: "GET",
        headers: { authorization: "AWS4-HMAC-SHA256 ..." },
        body: undefined,
      });
      mockFetch.mockRejectedValue(new Error("Network error"));

      const options: SigV4FetchLikeOptions = {
        region: "us-east-1",
        service: "lambda",
        baseFetch: mockFetch,
      };
      const sigV4Fetch = new SigV4FetchLike(options);

      await expect(sigV4Fetch.fetch(testUrl, undefined)).rejects.toThrow(
        "Network error"
      );
    });
  });

  describe("createSigV4Fetch", () => {
    let mockFetch: jest.MockedFunction<typeof fetch>;

    beforeEach(() => {
      mockFetch = jest.fn();
    });

    it("should create a FetchLike function that signs requests", async () => {
      const testUrl = "https://example.com/test";
      const signedHeaders = {
        authorization: "AWS4-HMAC-SHA256 ...",
        "x-amz-date": "20231201T120000Z",
      };

      mockSign.mockResolvedValue({
        method: "GET",
        headers: signedHeaders,
        body: undefined,
      });

      const mockResponse = new Response("test response");
      mockFetch.mockResolvedValue(mockResponse);

      const options: SigV4FetchLikeOptions = {
        region: "us-east-1",
        service: "lambda",
        baseFetch: mockFetch,
      };
      const sigV4Fetch = createSigV4Fetch(options);

      const result = await sigV4Fetch(testUrl, undefined);

      expect(HttpRequest).toHaveBeenCalledWith({
        method: "GET",
        protocol: "https:",
        hostname: "example.com",
        path: "/test",
        headers: {
          host: "example.com",
        },
        body: undefined,
      });

      expect(mockSign).toHaveBeenCalledWith(expect.any(HttpRequest));
      expect(mockFetch).toHaveBeenCalledWith(new URL(testUrl), {
        method: "GET",
        headers: signedHeaders,
        body: undefined,
      });
      expect(result).toBe(mockResponse);
    });

    it("should work with StreamableHTTPClientTransport", async () => {
      const testUrl = "https://example.com/test";
      const signedHeaders = {
        authorization: "AWS4-HMAC-SHA256 ...",
        "x-amz-date": "20231201T120000Z",
      };

      mockSign.mockResolvedValue({
        method: "GET",
        headers: signedHeaders,
        body: undefined,
      });

      const mockResponse = new Response("test response");
      mockFetch.mockResolvedValue(mockResponse);

      const options: SigV4FetchLikeOptions = {
        region: "us-east-1",
        service: "lambda",
        baseFetch: mockFetch,
      };
      const sigV4Fetch = createSigV4Fetch(options);

      // This demonstrates how users can now use the SigV4 fetch with any transport
      const result = await sigV4Fetch(testUrl, { method: "GET" });

      expect(result).toBe(mockResponse);
      expect(mockSign).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("credential provider integration", () => {
    test("should use default provider when no credentials provided", () => {
      const url = new URL("https://example.com/mcp");
      const options: StreamableHTTPClientWithSigV4TransportOptions = {
        region: "us-east-1",
        service: "lambda",
      };

      new StreamableHTTPClientWithSigV4Transport(url, options);

      expect(defaultProvider).toHaveBeenCalled();
      expect(SignatureV4).toHaveBeenCalledWith({
        service: "lambda",
        region: "us-east-1",
        credentials: mockDefaultProvider,
        sha256: expect.any(Function),
      });
    });

    test("should use provided credential provider function", () => {
      const url = new URL("https://example.com/mcp");
      const customProvider = jest.fn().mockResolvedValue(mockCredentials);
      const options: StreamableHTTPClientWithSigV4TransportOptions = {
        region: "us-east-1",
        service: "lambda",
        credentials: customProvider,
      };

      new StreamableHTTPClientWithSigV4Transport(url, options);

      expect(SignatureV4).toHaveBeenCalledWith({
        service: "lambda",
        region: "us-east-1",
        credentials: customProvider,
        sha256: expect.any(Function),
      });
      expect(defaultProvider).not.toHaveBeenCalled();
    });

    test("should use provided static credentials", () => {
      const url = new URL("https://example.com/mcp");
      const staticCredentials: AwsCredentialIdentity = {
        accessKeyId: "static-key",
        secretAccessKey: "static-secret",
      };
      const options: StreamableHTTPClientWithSigV4TransportOptions = {
        region: "us-east-1",
        service: "lambda",
        credentials: staticCredentials,
      };

      new StreamableHTTPClientWithSigV4Transport(url, options);

      expect(SignatureV4).toHaveBeenCalledWith({
        service: "lambda",
        region: "us-east-1",
        credentials: staticCredentials,
        sha256: expect.any(Function),
      });
      expect(defaultProvider).not.toHaveBeenCalled();
    });
  });
});
