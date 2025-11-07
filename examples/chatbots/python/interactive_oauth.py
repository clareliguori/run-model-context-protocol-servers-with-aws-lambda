"""
Interactive OAuth server client for MCP servers requiring OAuth authentication.

This client handles the complete OAuth flow including browser-based authorization.
"""

import logging
import threading
import time
import webbrowser
import httpx
from datetime import timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional
from urllib.parse import parse_qs, urlparse

from mcp.client.auth import (
    OAuthClientProvider,
    TokenStorage,
)
from mcp.client.streamable_http import streamablehttp_client, MCP_PROTOCOL_VERSION
from mcp.shared.auth import (
    OAuthClientInformationFull,
    OAuthClientMetadata,
    OAuthToken,
    ProtectedResourceMetadata,
)
from mcp.types import LATEST_PROTOCOL_VERSION


class InMemoryTokenStorage(TokenStorage):
    """
    Simple in-memory token storage implementation.
    In production, you should persist tokens securely. However, for
    the demo chatbot, it's ok to ask the user to re-authenticate
    in the browser each time they run the chatbot.
    """

    def __init__(self):
        self._client_info: Optional[OAuthClientInformationFull] = None
        self._token: Optional[OAuthToken] = None

    async def get_client_info(self) -> Optional[OAuthClientInformationFull]:
        return self._client_info

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        self._client_info = client_info

    async def get_token(self) -> Optional[OAuthToken]:
        return self._token

    async def set_token(self, token: OAuthToken) -> None:
        self._token = token

    async def clear_token(self) -> None:
        self._token = None


class CallbackHandler(BaseHTTPRequestHandler):
    """HTTP request handler for OAuth callback."""

    def __init__(self, request, client_address, server, callback_data):
        """Initialize with callback data storage."""
        self.callback_data = callback_data
        super().__init__(request, client_address, server)

    def do_GET(self):
        """Handle GET request for OAuth callback."""
        parsed_url = urlparse(self.path)
        query_params = parse_qs(parsed_url.query)

        if parsed_url.path == "/callback":
            # Extract authorization code and state
            auth_code = query_params.get("code", [None])[0]
            state = query_params.get("state", [None])[0]
            error = query_params.get("error", [None])[0]

            if error:
                self.callback_data["error"] = error
                self.send_response(400)
                self.send_header("Content-type", "text/html")
                self.end_headers()
                self.wfile.write(
                    f"<html><body><h1>Authorization Failed</h1><p>Error: {error}</p></body></html>".encode()
                )
            elif auth_code:
                self.callback_data["code"] = auth_code
                self.callback_data["state"] = state
                self.send_response(200)
                self.send_header("Content-type", "text/html")
                self.end_headers()
                self.wfile.write(
                    b"<html><body><h1>Authorization Successful</h1><p>You can close this window.</p></body></html>"
                )
            else:
                self.send_response(400)
                self.send_header("Content-type", "text/html")
                self.end_headers()
                self.wfile.write(
                    b"<html><body><h1>Authorization Failed</h1><p>No authorization code received.</p></body></html>"
                )
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        """Suppress default logging."""
        pass


class CallbackServer:
    """HTTP server for handling OAuth callbacks."""

    def __init__(self, port=8090):
        self.port = port
        self.callback_data = {}
        self.server = None
        self.thread = None

    def start(self):
        """Start the callback server."""
        handler = lambda *args: CallbackHandler(*args, self.callback_data)
        self.server = HTTPServer(("localhost", self.port), handler)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.daemon = True
        self.thread.start()
        logging.debug(f"Callback server started on port {self.port}")

    def stop(self):
        """Stop the callback server."""
        if self.server:
            self.server.shutdown()
            self.server.server_close()
        if self.thread:
            self.thread.join(timeout=1)
        logging.debug("Callback server stopped")

    def wait_for_callback(self, timeout=300):
        """Wait for OAuth callback with timeout."""
        start_time = time.time()
        while time.time() - start_time < timeout:
            if "code" in self.callback_data:
                return self.callback_data["code"]
            elif "error" in self.callback_data:
                raise ValueError(f"OAuth error: {self.callback_data['error']}")
            time.sleep(0.1)
        raise TimeoutError("OAuth callback timeout")

    def get_state(self):
        """Get the state parameter from callback."""
        return self.callback_data.get("state")


class InteractiveOAuthClient:
    """
    Manages OAuth authentication for MCP servers requiring interactive OAuth.

    This client handles the complete OAuth flow including browser-based authorization.
    """

    def __init__(self, name: str, server_url: str, client_id: str = None):
        self.name = name
        self.server_url = server_url
        self.client_id = client_id
        self.callback_port = 8090
        self.callback_url = f"http://localhost:{self.callback_port}/callback"

    async def create_transport(self):
        """Create OAuth-authenticated transport for MCP communication."""
        if not self.server_url:
            raise ValueError(
                "The server_url must be a valid string and cannot be undefined."
            )

        logging.debug(f"Connecting to OAuth-protected MCP server: {self.server_url}")

        # Create OAuth client metadata
        client_metadata_dict = {
            "client_name": f"MCP Client - {self.name}",
            "redirect_uris": [self.callback_url],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",  # No client secret for example servers
        }

        # Add client_id to metadata if available
        if self.client_id:
            client_metadata_dict["client_id"] = self.client_id

        # Create callback server
        callback_server = CallbackServer(port=self.callback_port)
        callback_server.start()

        async def callback_handler() -> tuple[str, Optional[str]]:
            """Wait for OAuth callback and return auth code and state."""
            logging.debug("Waiting for authorization callback...")
            try:
                auth_code = callback_server.wait_for_callback(timeout=300)
                return auth_code, callback_server.get_state()
            finally:
                callback_server.stop()

        async def redirect_handler(authorization_url: str) -> None:
            """Handle OAuth redirect by opening browser."""
            logging.debug(f"OAuth redirect handler called - opening browser")
            self._open_browser(authorization_url)

        # Create OAuth authentication handler
        storage = InMemoryTokenStorage()

        # If we have a client_id, create and store client info to skip client registration
        if self.client_id:
            client_info = OAuthClientInformationFull(
                client_id=self.client_id,
                client_id_issued_at=int(time.time()),
                client_name=client_metadata_dict["client_name"],
                redirect_uris=client_metadata_dict["redirect_uris"],
                grant_types=client_metadata_dict["grant_types"],
                response_types=client_metadata_dict["response_types"],
                token_endpoint_auth_method=client_metadata_dict[
                    "token_endpoint_auth_method"
                ],
            )
            # Store client info synchronously before creating the OAuth provider
            await storage.set_client_info(client_info)
            logging.debug(f"Pre-configured client info with ID: {self.client_id}")

        oauth_auth = OAuthClientProvider(
            server_url=self.server_url,
            client_metadata=OAuthClientMetadata.model_validate(client_metadata_dict),
            storage=storage,
            redirect_handler=redirect_handler,
            callback_handler=callback_handler,
        )

        # Discover the required scope from the server and re-create the provider with the scope
        scope = await self.discover_scope(self.server_url, oauth_auth)
        logging.debug(f"Discovered scope from server metadata: {scope}")

        client_metadata_dict["scope"] = scope
        if self.client_id:
            client_info.scope = scope

        oauth_auth = OAuthClientProvider(
            server_url=self.server_url,
            client_metadata=OAuthClientMetadata.model_validate(client_metadata_dict),
            storage=storage,
            redirect_handler=redirect_handler,
            callback_handler=callback_handler,
        )

        logging.debug("Creating transport with OAuth provider...")
        return streamablehttp_client(
            url=self.server_url,
            auth=oauth_auth,
            timeout=timedelta(seconds=60),
        )

    async def discover_scope(
        self, server_url: str, oauthProvider: OAuthClientProvider
    ) -> str:
        """Discovers the required scope from OAuth protected resource metadata."""
        logging.debug("Discovering OAuth metadata...")

        async with httpx.AsyncClient() as client:
            headers = {MCP_PROTOCOL_VERSION: LATEST_PROTOCOL_VERSION}
            response = await client.get(
                server_url, headers=headers, follow_redirects=True
            )

            discovery_request = await oauthProvider._discover_protected_resource(
                response
            )
            logging.debug(
                f"Discovery request: {discovery_request.method} {discovery_request.url}"
            )
            discovery_response = await client.send(discovery_request)
            if discovery_response.status_code != 200:
                logging.warning(
                    f"Response code from discovery request was {discovery_response.status_code}. Using empty scope."
                )
                return ""

            content = await discovery_response.aread()
            resource_metadata = ProtectedResourceMetadata.model_validate_json(content)

            if not resource_metadata.scopes_supported:
                logging.warning(
                    "No scopes found in OAuth protected resource metadata. Using empty scope."
                )
                return ""

            discovered_scope = " ".join(resource_metadata.scopes_supported)
            logging.debug(f"Discovered scope: {discovered_scope}")
            return discovered_scope

    def _open_browser(self, url: str) -> None:
        """Open the authorization URL in the user's default browser."""
        logging.debug(f"Opening browser for authorization: {url}")
        try:
            webbrowser.open(url)
        except Exception as error:
            logging.error(f"Failed to open browser: {error}")
            logging.info(f"Please manually open: {url}")
