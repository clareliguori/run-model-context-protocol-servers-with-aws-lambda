import {
  StreamableHTTPClientTransport,
  StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { SignatureV4 } from "@smithy/signature-v4";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";

/**
 * Configuration options for SigV4FetchLike
 */
export interface SigV4FetchLikeOptions {
  /**
   * AWS credentials (provider), if not provided, default provider will be used
   */
  credentials?: AwsCredentialIdentity | Provider<AwsCredentialIdentity>;

  /**
   * AWS region for signing requests
   */
  region: string;

  /**
   * AWS service name for signing requests (e.g., 'lambda', 'execute-api')
   */
  service: string;

  /**
   * Base fetch implementation to use for actual HTTP requests
   * If not provided, the global fetch will be used
   */
  baseFetch?: FetchLike;
}

/**
 * A FetchLike implementation that signs HTTP requests using AWS Signature Version 4.
 *
 * This class can be passed to any transport that accepts a FetchLike parameter.
 * It wraps a base fetch implementation and automatically signs all requests with AWS SigV4.
 */
export class SigV4FetchLike {
  private _signer: SignatureV4;
  private _baseFetch: FetchLike;

  constructor(options: SigV4FetchLikeOptions) {
    this._baseFetch = options.baseFetch ?? fetch;
    this._signer = new SignatureV4({
      service: options.service,
      region: options.region,
      credentials: options.credentials ?? defaultProvider(),
      sha256: Sha256,
    });
  }

  /**
   * Fetch implementation that signs requests with AWS SigV4
   */
  async fetch(url: string | URL, init?: RequestInit): Promise<Response> {
    const urlObj = typeof url === "string" ? new URL(url) : url;
    const requestInit = init || {};

    // Convert fetch RequestInit to HttpRequest for signing
    const headers: Record<string, string> = {
      host: urlObj.hostname,
    };

    if (requestInit.headers) {
      if (requestInit.headers instanceof Headers) {
        requestInit.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });
      } else if (Array.isArray(requestInit.headers)) {
        requestInit.headers.forEach(([key, value]) => {
          headers[key.toLowerCase()] = value;
        });
      } else {
        Object.entries(requestInit.headers).forEach(([key, value]) => {
          headers[key.toLowerCase()] = value;
        });
      }
    }

    const unsignedRequest = new HttpRequest({
      method: requestInit.method || "GET",
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port ? parseInt(urlObj.port) : undefined,
      path: urlObj.pathname + urlObj.search,
      headers,
      body: requestInit.body as string | undefined,
    });

    // Sign the request
    const signedRequest = await this._signer.sign(unsignedRequest);

    // Convert signed request back to fetch format
    const signedInit: RequestInit = {
      ...requestInit,
      method: signedRequest.method,
      headers: signedRequest.headers,
      body: signedRequest.body,
    };

    return this._baseFetch(urlObj, signedInit);
  }
}

/**
 * Creates a FetchLike function that signs HTTP requests using AWS Signature Version 4.
 *
 * This function can be passed to any transport that accepts a FetchLike parameter,
 * such as StreamableHTTPClientTransport.
 *
 * @param options Configuration options for AWS SigV4 signing
 * @returns A FetchLike function that automatically signs requests
 *
 * @example
 * ```typescript
 * const sigV4Fetch = createSigV4Fetch({
 *   region: 'us-east-1',
 *   service: 'lambda'
 * });
 *
 * const transport = new StreamableHTTPClientTransport(url, {
 *   fetch: sigV4Fetch
 * });
 * ```
 */
export function createSigV4Fetch(options: SigV4FetchLikeOptions): FetchLike {
  const sigV4Fetch = new SigV4FetchLike(options);
  return sigV4Fetch.fetch.bind(sigV4Fetch);
}

/**
 * Extended options for StreamableHTTPClientWithSigV4Transport
 */
export interface StreamableHTTPClientWithSigV4TransportOptions
  extends StreamableHTTPClientTransportOptions {
  /**
   * AWS credentials (provider), if not provided, default provider will be used
   */
  credentials?: AwsCredentialIdentity | Provider<AwsCredentialIdentity>;

  /**
   * AWS region for signing requests
   */
  region: string;

  /**
   * AWS service name for signing requests (e.g., 'lambda', 'execute-api')
   */
  service: string;
}

/**
 * Streamable HTTP client transport with AWS SigV4 signing support.
 *
 * This transport enables communication with MCP servers that authenticate using AWS IAM,
 * such as servers behind a Lambda function URL or API Gateway.
 */
export class StreamableHTTPClientWithSigV4Transport extends StreamableHTTPClientTransport {
  constructor(
    url: URL,
    options: StreamableHTTPClientWithSigV4TransportOptions
  ) {
    const sigV4Fetch = createSigV4Fetch({
      credentials: options.credentials,
      region: options.region,
      service: options.service,
      baseFetch: options.fetch,
    });

    super(url, {
      ...options,
      fetch: sigV4Fetch,
    });
  }
}
