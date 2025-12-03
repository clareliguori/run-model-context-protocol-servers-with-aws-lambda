import { createServer } from "node:http";
import { URL } from "node:url";
import { exec } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  OAuthClientProvider,
  UnauthorizedError,
  discoverOAuthProtectedResourceMetadata,
  extractResourceMetadataUrl,
} from "@modelcontextprotocol/sdk/client/auth.js";
import logger from "./logger.js";

export class InteractiveOAuthClient extends StreamableHTTPClientTransport {
  name: string;
  serverUrl: string;
  clientId?: string;
  private oauthProvider?: InMemoryOAuthClientProvider;
  private callbackPort: number;
  private callbackUrl: string;
  private initialized = false;

  constructor(name: string, serverUrl: string, clientId?: string) {
    // Don't call super yet - we'll initialize after OAuth flow
    super(new URL(serverUrl), {});
    this.name = name;
    this.serverUrl = serverUrl;
    this.clientId = clientId;

    this.callbackPort = 8090;
    this.callbackUrl = `http://localhost:${this.callbackPort}/callback`;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.debug(`Connecting to OAuth-protected MCP server: ${this.serverUrl}`);

      const scope = await this.discoverScope();

      const clientMetadata: OAuthClientMetadata = {
        client_name: `MCP Client - ${this.name}`,
        redirect_uris: [this.callbackUrl],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: scope,
      };

      logger.debug("Creating OAuth provider...");
      this.oauthProvider = new InMemoryOAuthClientProvider(
        this.callbackUrl,
        clientMetadata,
        this.clientId,
        undefined,
        (redirectUrl: URL) => {
          logger.debug(`OAuth redirect handler called - opening browser`);
          this.openBrowser(redirectUrl.toString());
        }
      );

      logger.debug("Starting OAuth flow...");
      await this.performOAuthFlow();
      this.initialized = true;
    } catch (error) {
      logger.error(`Error initializing OAuth server ${this.name}: ${error}`);
      throw error;
    }
  }

  /**
   * Opens the authorization URL in the user's default browser
   */
  private async openBrowser(url: string): Promise<void> {
    logger.debug(`Opening browser for authorization: ${url}`);

    const command = `open "${url}"`;

    exec(command, (error) => {
      if (error) {
        logger.error(`Failed to open browser: ${error.message}`);
        logger.info(`Please manually open: ${url}`);
      }
    });
  }

  /**
   * Starts a temporary HTTP server to receive the OAuth callback
   */
  private async waitForOAuthCallback(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const server = createServer((req, res) => {
        // Ignore favicon requests
        if (req.url === "/favicon.ico") {
          res.writeHead(404);
          res.end();
          return;
        }

        logger.debug(`Received OAuth callback: ${req.url}`);
        const parsedUrl = new URL(req.url || "", "http://localhost");
        const code = parsedUrl.searchParams.get("code");
        const error = parsedUrl.searchParams.get("error");

        if (code) {
          logger.debug(
            `Authorization code received: ${code?.substring(0, 10)}...`
          );
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body>
                <h1>Authorization Successful!</h1>
                <p>You can close this window and return to the application.</p>
                <script>setTimeout(() => window.close(), 2000);</script>
              </body>
            </html>
          `);

          server.close(() => {
            resolve(code);
          });
        } else if (error) {
          logger.error(`Authorization error: ${error}`);
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body>
                <h1>Authorization Failed</h1>
                <p>Error: ${error}</p>
              </body>
            </html>
          `);
          server.close(() => {
            reject(new Error(`OAuth authorization failed: ${error}`));
          });
        } else {
          logger.error(`No authorization code or error in callback`);
          res.writeHead(400);
          res.end("Bad request");
          server.close(() => {
            reject(new Error("No authorization code provided"));
          });
        }
      });

      server.listen(this.callbackPort, () => {
        logger.debug(
          `OAuth callback server started on http://localhost:${this.callbackPort}`
        );
      });
    });
  }

  /**
   * Discovers the required scope from OAuth protected resource metadata
   */
  private async discoverScope(): Promise<string> {
    logger.debug("Making initial request to discover OAuth metadata...");

    const response = await fetch(this.serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
    });
    const resourceMetadataUrl = extractResourceMetadataUrl(response);

    logger.debug(`Discovered resource metadata URL: ${resourceMetadataUrl}`);
    logger.debug("Fetching OAuth protected resource metadata...");

    const resourceMetadata = await discoverOAuthProtectedResourceMetadata(
      this.serverUrl,
      { resourceMetadataUrl }
    );

    if (
      !resourceMetadata.scopes_supported ||
      resourceMetadata.scopes_supported.length === 0
    ) {
      logger.warn(
        "No scopes found in OAuth protected resource metadata. Using empty scope."
      );
      return "";
    }

    const discoveredScope = resourceMetadata.scopes_supported.join(" ");
    logger.debug(`Discovered scope from server metadata: ${discoveredScope}`);
    return discoveredScope;
  }

  /**
   * Performs OAuth flow without connecting the transport
   */
  private async performOAuthFlow(): Promise<void> {
    logger.debug("Creating temporary transport for OAuth flow...");
    const baseUrl = new URL(this.serverUrl);
    const transport = new StreamableHTTPClientTransport(baseUrl, {
      authProvider: this.oauthProvider,
    });

    const tempClient = new Client(
      { name: "typescript-chatbot", version: "0.1.0" },
      { capabilities: { sampling: {} } }
    );

    try {
      logger.debug("Attempting connection to trigger OAuth flow...");
      await tempClient.connect(transport);
      logger.debug("OAuth flow completed successfully");
      
      // Now reinitialize this transport with the authenticated provider
      Object.assign(this, new StreamableHTTPClientTransport(baseUrl, {
        authProvider: this.oauthProvider,
      }));
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        logger.debug("OAuth required - waiting for authorization...");
        const callbackPromise = this.waitForOAuthCallback();
        const authCode = await callbackPromise;
        await transport.finishAuth(authCode);
        logger.debug("Authorization completed successfully");
        logger.debug("Retrying OAuth flow...");
        await this.performOAuthFlow();
      } else {
        logger.error("OAuth flow failed:", error);
        throw error;
      }
    }
  }
}

/**
 * In-memory OAuth client provider for interactive OAuth flows.
 * In production, you should persist tokens securely. However, for
 * the demo chatbot, it's ok to ask the user to re-authenticate
 * in the browser each time they run the demo.
 */
class InMemoryOAuthClientProvider implements OAuthClientProvider {
  private _clientInformation?: OAuthClientInformationFull;
  private _tokens?: OAuthTokens;
  private _codeVerifier?: string;

  constructor(
    private readonly _redirectUrl: string | URL,
    private readonly _clientMetadata: OAuthClientMetadata,
    private readonly _clientId?: string,
    private readonly _clientSecret?: string,
    onRedirect?: (url: URL) => void
  ) {
    this._onRedirect =
      onRedirect ||
      ((url) => {
        console.log(`Redirect to: ${url.toString()}`);
      });

    // Fill in OAuth client ID and client secret if provided
    if (this._clientId) {
      this._clientInformation = {
        client_id: this._clientId,
        client_secret: this._clientSecret,
        ...this._clientMetadata,
      };
    }
  }

  private _onRedirect: (url: URL) => void;

  get redirectUrl(): string | URL {
    return this._redirectUrl;
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

  redirectToAuthorization(authorizationUrl: URL): void {
    this._onRedirect(authorizationUrl);
  }

  saveCodeVerifier(codeVerifier: string): void {
    this._codeVerifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this._codeVerifier) {
      throw new Error("No code verifier saved");
    }
    return this._codeVerifier;
  }
}
