import { URL } from "node:url";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  OAuthClientProvider,
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  extractResourceMetadataUrl,
} from "@modelcontextprotocol/sdk/client/auth.js";

export async function createAutomatedOAuthTransport(
  serverUrl: string,
  clientId: string,
  clientSecret: string
): Promise<StreamableHTTPClientTransport> {
  const scope = await retryWithBackoff(() => discoverScope(serverUrl), 5, 2000);

  const clientMetadata: OAuthClientMetadata = {
    client_name: "MCP Client",
    redirect_uris: [],
    grant_types: ["client_credentials"],
    response_types: [],
    token_endpoint_auth_method: "client_secret_basic",
    scope,
  };

  const oauthProvider = new AutomatedOAuthClientProvider(clientMetadata, clientId, clientSecret);
  await retryWithBackoff(() => performClientCredentialsFlow(serverUrl, oauthProvider), 5, 2000);

  return new StreamableHTTPClientTransport(new URL(serverUrl), {
    authProvider: oauthProvider,
  });
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  initialDelay: number
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

async function discoverScope(serverUrl: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
      signal: controller.signal,
    });
    const resourceMetadataUrl = extractResourceMetadataUrl(response);
    const resourceMetadata = await discoverOAuthProtectedResourceMetadata(serverUrl, { resourceMetadataUrl });
    return resourceMetadata.scopes_supported?.join(" ") || "";
  } finally {
    clearTimeout(timeout);
  }
}

async function performClientCredentialsFlow(serverUrl: string, oauthProvider: AutomatedOAuthClientProvider): Promise<void> {
  if (oauthProvider.tokens()?.access_token) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
      signal: controller.signal,
    });
    const resourceMetadataUrl = extractResourceMetadataUrl(response);
    const resourceMetadata = await discoverOAuthProtectedResourceMetadata(serverUrl, { resourceMetadataUrl });
    const authServerUrl = resourceMetadata.authorization_servers?.[0];
    if (!authServerUrl) throw new Error("No authorization server found");

    const metadata = await discoverAuthorizationServerMetadata(authServerUrl);
    if (!metadata?.token_endpoint) throw new Error("No token endpoint found");

    const clientInfo = oauthProvider.clientInformation();
    if (!clientInfo) throw new Error("No client information available");

    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientInfo.client_id,
      client_secret: clientInfo.client_secret!,
      scope: oauthProvider.clientMetadata.scope || "",
    });

    const tokenResponse = await fetch(metadata.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      signal: controller.signal,
    });

    if (!tokenResponse.ok) throw new Error(`Token request failed: ${tokenResponse.status}`);
    oauthProvider.saveTokens(await tokenResponse.json());
  } finally {
    clearTimeout(timeout);
  }
}

class AutomatedOAuthClientProvider implements OAuthClientProvider {
  private _clientInformation: OAuthClientInformationFull;
  private _tokens?: OAuthTokens;

  constructor(
    private readonly _clientMetadata: OAuthClientMetadata,
    clientId: string,
    clientSecret: string
  ) {
    this._clientInformation = {
      client_id: clientId,
      client_secret: clientSecret,
      ...this._clientMetadata,
    };
  }

  get redirectUrl(): string | URL {
    return "";
  }

  get clientMetadata(): OAuthClientMetadata {
    return this._clientMetadata;
  }

  clientInformation(): OAuthClientInformation | undefined {
    return this._clientInformation;
  }

  saveClientInformation(clientInformation: OAuthClientInformationFull): void {
    this._clientInformation = clientInformation;
  }

  tokens(): OAuthTokens | undefined {
    return this._tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this._tokens = tokens;
  }

  redirectToAuthorization(): void {
    throw new Error("redirectToAuthorization should not be called in automated OAuth flow");
  }

  saveCodeVerifier(): void {
    throw new Error("saveCodeVerifier should not be called in automated OAuth flow");
  }

  codeVerifier(): string {
    throw new Error("codeVerifier should not be called in automated OAuth flow");
  }
}
