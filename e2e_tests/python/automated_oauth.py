"""
Automated OAuth server client for MCP servers requiring OAuth authentication.

This client handles OAuth using client credentials grant (machine-to-machine authentication)
without browser interaction.
"""

import logging
import time
from datetime import timedelta
from typing import Optional

import httpx

from mcp.client.auth import OAuthClientProvider, TokenStorage
from mcp.client.auth.utils import build_oauth_authorization_server_metadata_discovery_urls
from mcp.client.streamable_http import streamablehttp_client, MCP_PROTOCOL_VERSION
from mcp.shared.auth import (
    OAuthClientInformationFull,
    OAuthClientMetadata,
    OAuthMetadata,
    OAuthToken,
    ProtectedResourceMetadata,
)
from mcp.types import LATEST_PROTOCOL_VERSION


class InMemoryTokenStorage(TokenStorage):
    """
    Simple in-memory token storage implementation for automated OAuth.
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


class AutomatedOAuthClientProvider(OAuthClientProvider):
    """
    OAuth client provider for automated (client credentials) OAuth flows.
    This provider handles machine-to-machine authentication without user interaction.
    """

    def __init__(
        self,
        server_url: str,
        client_metadata: OAuthClientMetadata,
        storage: TokenStorage,
        client_id: str,
        client_secret: str,
        authorization_server_url: str,
    ):
        # Create dummy handlers since they won't be used in client credentials flow
        async def dummy_redirect_handler(url: str) -> None:
            raise RuntimeError(
                "Redirect handler should not be called in automated OAuth flow"
            )

        async def dummy_callback_handler() -> tuple[str, Optional[str]]:
            raise RuntimeError(
                "Callback handler should not be called in automated OAuth flow"
            )

        super().__init__(
            server_url=server_url,
            client_metadata=client_metadata,
            storage=storage,
            redirect_handler=dummy_redirect_handler,
            callback_handler=dummy_callback_handler,
        )

        self.client_id = client_id
        self.client_secret = client_secret
        self.authorization_server_url = authorization_server_url

    async def async_auth_flow(self, request):
        """Override the parent's auth flow to use client credentials only."""
        await self.perform_client_credentials_flow()

        # Add the access token to the request
        if self.context.current_tokens and self.context.current_tokens.access_token:
            token_type = self.context.current_tokens.token_type or "Bearer"
            request.headers["Authorization"] = (
                f"{token_type} {self.context.current_tokens.access_token}"
            )

        yield request

    async def perform_client_credentials_flow(self) -> None:
        """Performs the client credentials OAuth flow to obtain access tokens."""
        try:
            # Check if we already have valid tokens
            current_tokens = await self.context.storage.get_token()
            if current_tokens and current_tokens.access_token:
                self.context.current_tokens = current_tokens
                self.context.update_token_expiry(current_tokens)
                if self.context.is_token_valid():
                    logging.debug("Using existing valid access token")
                    return

            logging.debug("Performing client credentials flow...")

            # Set auth server URL and discover OAuth metadata using upstream logic
            self.context.auth_server_url = self.authorization_server_url
            await self._discover_oauth_metadata()

            if (
                not self.context.oauth_metadata
                or not self.context.oauth_metadata.token_endpoint
            ):
                raise RuntimeError("No token endpoint found in OAuth metadata")

            # Create client info and store it
            client_info = OAuthClientInformationFull(
                client_id=self.client_id,
                client_secret=self.client_secret,
                client_id_issued_at=int(time.time()),
                **self.context.client_metadata.model_dump(exclude_unset=True),
            )
            await self.context.storage.set_client_info(client_info)
            self.context.client_info = client_info

            # Perform client credentials token request
            token_data = {
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            }

            # Add scope if specified
            if self.context.client_metadata.scope:
                token_data["scope"] = self.context.client_metadata.scope

            logging.debug(
                f"Making token request to: {self.context.oauth_metadata.token_endpoint}"
            )

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    str(self.context.oauth_metadata.token_endpoint),
                    data=token_data,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )

                if response.status_code != 200:
                    error_text = response.text
                    raise RuntimeError(
                        f"Token request failed: HTTP {response.status_code} - {error_text}"
                    )

                token_response = response.json()

            # Create and store tokens
            tokens = OAuthToken(
                access_token=token_response["access_token"],
                token_type=token_response.get("token_type", "Bearer"),
                expires_in=token_response.get("expires_in"),
                refresh_token=token_response.get("refresh_token"),
                scope=token_response.get("scope"),
            )

            await self.context.storage.set_token(tokens)
            self.context.current_tokens = tokens
            self.context.update_token_expiry(tokens)

            logging.debug(
                "Successfully obtained access token via client credentials flow"
            )

        except Exception as error:
            logging.error(f"Client credentials flow failed: {error}")
            raise

    async def _discover_oauth_metadata(self) -> None:
        """Discover OAuth metadata using upstream MCP SDK discovery logic."""

        discovery_urls = build_oauth_authorization_server_metadata_discovery_urls(
            self.context.auth_server_url, self.context.server_url
        )

        async with httpx.AsyncClient() as client:
            for metadata_url in discovery_urls:
                try:
                    response = await client.get(metadata_url, follow_redirects=True)
                    if response.status_code == 200:
                        metadata = OAuthMetadata.model_validate_json(response.content)
                        self.context.oauth_metadata = metadata
                        logging.debug(
                            f"Successfully discovered OAuth metadata from: {metadata_url}"
                        )
                        return
                except Exception as e:
                    logging.debug(
                        f"Failed to discover OAuth metadata from {metadata_url}: {e}"
                    )
                    continue

        raise RuntimeError(
            "Failed to discover OAuth metadata from any well-known endpoint"
        )


class AutomatedOAuthClient:
    """
    Manages OAuth authentication for MCP servers requiring automated OAuth.

    This client handles OAuth using client credentials grant (machine-to-machine authentication)
    without browser interaction.
    """

    def __init__(self, name: str, server_url: str, client_id: str, client_secret: str):
        self.name = name
        self.server_url = server_url
        self.client_id = client_id
        self.client_secret = client_secret

    async def create_transport(self):
        """Create OAuth-authenticated transport for MCP communication."""
        logging.debug(f"Connecting to OAuth-protected MCP server: {self.server_url}")

        # Discover the required scope from the server
        scope, authorization_server_url = await self._discover_scope_and_auth_server(
            self.server_url
        )

        # Get OAuth client configuration (handled by mcp_clients.py)
        if not self.client_id or not self.client_secret:
            raise ValueError("client_id and client_secret must be provided")

        # Create client metadata
        client_metadata = OAuthClientMetadata(
            client_name=f"MCP Client - {self.name}",
            redirect_uris=["http://localhost"],
            grant_types=["client_credentials"],
            token_endpoint_auth_method="client_secret_post",
            scope=scope,
        )

        # Create storage and OAuth provider
        storage = InMemoryTokenStorage()
        oauth_provider = AutomatedOAuthClientProvider(
            server_url=self.server_url,
            client_metadata=client_metadata,
            storage=storage,
            client_id=self.client_id,
            client_secret=self.client_secret,
            authorization_server_url=authorization_server_url,
        )

        # Perform client credentials flow
        logging.debug("Starting automated OAuth flow...")
        await oauth_provider.perform_client_credentials_flow()

        # Create transport with OAuth provider
        logging.debug("Creating transport with automated OAuth provider...")
        return streamablehttp_client(
            url=self.server_url,
            auth=oauth_provider,
            timeout=timedelta(seconds=60),
        )

    async def _discover_scope_and_auth_server(self, server_url: str) -> tuple[str, str]:
        """Discovers the required scope and authorization server from OAuth protected resource metadata."""
        logging.debug("Making initial request to discover OAuth metadata...")

        async with httpx.AsyncClient() as client:
            headers = {MCP_PROTOCOL_VERSION: LATEST_PROTOCOL_VERSION}
            response = await client.post(
                server_url,
                headers=headers,
                follow_redirects=True,
                json={"jsonrpc": "2.0", "method": "ping", "id": 1},
            )

            if response.status_code != 401:
                raise RuntimeError(
                    f"Expected 401 response for OAuth discovery, got {response.status_code}"
                )

            # Extract resource metadata URL from WWW-Authenticate header
            www_auth_header = response.headers.get("WWW-Authenticate")
            resource_metadata_url = None

            if www_auth_header:
                # Simple extraction of resource_metadata URL
                import re

                pattern = r'resource_metadata=(?:"([^"]+)"|([^\s,]+))'
                match = re.search(pattern, www_auth_header)
                if match:
                    resource_metadata_url = match.group(1) or match.group(2)

            if not resource_metadata_url:
                # Fallback to well-known discovery
                from urllib.parse import urlparse, urljoin

                parsed = urlparse(server_url)
                base_url = f"{parsed.scheme}://{parsed.netloc}"
                resource_metadata_url = urljoin(
                    base_url, "/.well-known/oauth-protected-resource"
                )

            logging.debug(f"Discovered resource metadata URL: {resource_metadata_url}")

            # Fetch protected resource metadata
            logging.debug("Fetching OAuth protected resource metadata...")
            metadata_response = await client.get(
                resource_metadata_url, headers=headers, follow_redirects=True
            )

            if metadata_response.status_code != 200:
                raise RuntimeError(
                    f"Failed to fetch resource metadata: HTTP {metadata_response.status_code}"
                )

            resource_metadata = ProtectedResourceMetadata.model_validate_json(
                metadata_response.content
            )

            # Extract authorization server
            if not resource_metadata.authorization_servers:
                raise RuntimeError(
                    "No authorization server found in OAuth protected resource metadata"
                )

            authorization_server_url = str(resource_metadata.authorization_servers[0])

            # Extract scope
            if not resource_metadata.scopes_supported:
                logging.warning(
                    "No scopes found in OAuth protected resource metadata. Using empty scope."
                )
                scope = ""
            else:
                scope = " ".join(resource_metadata.scopes_supported)

            logging.debug(f"Discovered scope: {scope}")
            logging.debug(
                f"Discovered authorization server: {authorization_server_url}"
            )

            return scope, authorization_server_url
