"""
Automated OAuth server client for MCP servers requiring OAuth authentication.

This client handles OAuth using client credentials grant (machine-to-machine authentication)
without browser interaction. It automatically looks up all required configuration from
CloudFormation stacks and AWS Secrets Manager.
"""

import logging
import time
from datetime import timedelta
from typing import Any, Optional

import boto3
import httpx
from botocore.exceptions import ClientError

from mcp.client.auth import OAuthClientProvider, TokenStorage
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamablehttp_client, MCP_PROTOCOL_VERSION
from mcp.shared.auth import (
    OAuthClientInformationFull,
    OAuthClientMetadata,
    OAuthMetadata,
    OAuthToken,
    ProtectedResourceMetadata,
)
from mcp.types import LATEST_PROTOCOL_VERSION

from server_clients.server import Server


class AutomatedOAuthConfig:
    """Configuration for AutomatedOAuthClient."""

    def __init__(
        self,
        server_stack_name: Optional[str] = None,
        server_stack_url_output_key: str = "McpServerUrl",
        server_stack_region: str = "us-west-2",
        **kwargs,
    ):
        # Handle camelCase parameter names from JSON config
        self.server_stack_name = kwargs.get("serverStackName", server_stack_name)
        self.server_stack_url_output_key = kwargs.get(
            "serverStackUrlOutputKey", server_stack_url_output_key
        )
        self.server_stack_region = kwargs.get("serverStackRegion", server_stack_region)

        # Fixed auth stack configuration
        self.auth_stack_name = "LambdaMcpServer-Auth"
        self.auth_stack_region = "us-west-2"


class InMemoryTokenStorage(TokenStorage):
    """Simple in-memory token storage implementation for automated OAuth."""

    def __init__(self):
        self._tokens: Optional[OAuthToken] = None
        self._client_info: Optional[OAuthClientInformationFull] = None

    async def get_tokens(self) -> Optional[OAuthToken]:
        return self._tokens

    async def set_tokens(self, tokens: OAuthToken) -> None:
        self._tokens = tokens

    async def get_client_info(self) -> Optional[OAuthClientInformationFull]:
        return self._client_info

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        self._client_info = client_info


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

    async def perform_client_credentials_flow(self) -> None:
        """Performs the client credentials OAuth flow to obtain access tokens."""
        try:
            # Check if we already have valid tokens
            current_tokens = await self.context.storage.get_tokens()
            if current_tokens and current_tokens.access_token:
                self.context.current_tokens = current_tokens
                self.context.update_token_expiry(current_tokens)
                if self.context.is_token_valid():
                    logging.debug("Using existing valid access token")
                    return

            logging.debug("Performing client credentials flow...")

            # Discover OAuth metadata
            async with httpx.AsyncClient() as client:
                base_url = self.authorization_server_url.rstrip("/")
                metadata_url = f"{base_url}/.well-known/oauth-authorization-server"
                response = await client.get(metadata_url)

                if response.status_code != 200:
                    raise RuntimeError(
                        f"Failed to discover OAuth metadata: HTTP {response.status_code}"
                    )

                metadata = OAuthMetadata.model_validate_json(response.content)

            if not metadata.token_endpoint:
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

            logging.debug(f"Making token request to: {metadata.token_endpoint}")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    str(metadata.token_endpoint),
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

            await self.context.storage.set_tokens(tokens)
            self.context.current_tokens = tokens
            self.context.update_token_expiry(tokens)

            logging.debug(
                "Successfully obtained access token via client credentials flow"
            )

        except Exception as error:
            logging.error(f"Client credentials flow failed: {error}")
            raise


class AutomatedOAuthClient(Server):
    """
    Manages MCP server connections and tool execution for streamable HTTP servers
    requiring automated OAuth authentication.

    This client handles OAuth using client credentials grant (machine-to-machine authentication)
    without browser interaction. It automatically looks up all required configuration from
    CloudFormation stacks and AWS Secrets Manager.

    Configuration is retrieved from:
    - Server URL: CloudFormation stack output
    - Client ID: CloudFormation stack output 'AutomatedOAuthClientId' from 'LambdaMcpServer-Auth' stack
    - Client Secret: AWS Secrets Manager secret (ARN from CloudFormation stack output 'OAuthClientSecretArn')
    """

    def __init__(self, name: str, config: AutomatedOAuthConfig):
        # Convert config to dict for base class
        config_dict = {
            "server_stack_name": config.server_stack_name,
            "server_stack_url_output_key": config.server_stack_url_output_key,
            "server_stack_region": config.server_stack_region,
            "auth_stack_name": config.auth_stack_name,
            "auth_stack_region": config.auth_stack_region,
        }
        super().__init__(name, config_dict)

        self.oauth_config = config
        self._transport_context = None
        self._session_context = None
        self._streams = None

    async def initialize(self) -> None:
        """Initialize the server connection with automated OAuth authentication."""
        try:
            # Get server URL from CloudFormation
            logging.debug("Retrieving server URL from CloudFormation...")
            server_url = await self._get_server_url_from_cloudformation()
            self.config["server_url"] = server_url

            logging.debug(f"Connecting to OAuth-protected MCP server: {server_url}")

            # Discover the required scope from the server
            scope, authorization_server_url = (
                await self._discover_scope_and_auth_server(server_url)
            )

            # Get OAuth client configuration
            logging.debug("Retrieving OAuth client configuration...")
            client_id = await self._get_client_id_from_cloudformation()
            client_secret = await self._get_client_secret_from_secrets_manager()

            # Create client metadata
            client_metadata = OAuthClientMetadata(
                client_name=f"MCP Client - {self.name}",
                redirect_uris=[
                    "http://localhost"
                ],  # Required but not used in client credentials flow
                grant_types=[
                    "authorization_code"
                ],  # Required format, though we use client_credentials
                response_types=["code"],  # Required for authorization_code grant type
                token_endpoint_auth_method="client_secret_post",
                scope=scope,
            )

            # Create storage and OAuth provider
            storage = InMemoryTokenStorage()
            oauth_provider = AutomatedOAuthClientProvider(
                server_url=server_url,
                client_metadata=client_metadata,
                storage=storage,
                client_id=client_id,
                client_secret=client_secret,
                authorization_server_url=authorization_server_url,
            )

            # Perform client credentials flow
            logging.debug("Starting automated OAuth flow...")
            await oauth_provider.perform_client_credentials_flow()

            # Create transport with OAuth provider
            logging.debug("Creating transport with automated OAuth provider...")
            self._transport_context = streamablehttp_client(
                url=server_url,
                auth=oauth_provider,
                timeout=timedelta(seconds=60),
            )

            # Enter the transport context
            self._streams = await self._transport_context.__aenter__()
            read_stream, write_stream, _ = self._streams

            logging.debug("Creating MCP session...")
            self._session_context = ClientSession(read_stream, write_stream)
            self.session = await self._session_context.__aenter__()

            logging.debug("Initializing MCP session...")
            await self.session.initialize()
            logging.debug("MCP session initialized successfully")

        except Exception as error:
            logging.error(
                f"Error initializing automated OAuth server {self.name}: {error}"
            )
            raise error

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with proper cleanup."""
        try:
            if self._session_context:
                await self._session_context.__aexit__(exc_type, exc_val, exc_tb)
                self._session_context = None
                self.session = None

            if self._transport_context:
                await self._transport_context.__aexit__(exc_type, exc_val, exc_tb)
                self._transport_context = None
                self._streams = None
        except Exception as e:
            logging.error(f"Error during cleanup: {e}")

        # Call parent cleanup
        await super().__aexit__(exc_type, exc_val, exc_tb)

    async def _discover_scope_and_auth_server(self, server_url: str) -> tuple[str, str]:
        """Discovers the required scope and authorization server from OAuth protected resource metadata."""
        logging.debug("Making initial request to discover OAuth metadata...")

        async with httpx.AsyncClient() as client:
            headers = {MCP_PROTOCOL_VERSION: LATEST_PROTOCOL_VERSION}
            response = await client.get(server_url, headers=headers)

            if response.status_code != 401:
                raise RuntimeError(
                    f"Expected 401 response for OAuth discovery, got {response.status_code}"
                )

            # Extract resource metadata URL from WWW-Authenticate header
            www_auth_header = response.headers.get("WWW-Authenticate")
            if not www_auth_header:
                raise RuntimeError("No WWW-Authenticate header found in response")

            # Simple extraction of resource_metadata URL
            import re

            pattern = r'resource_metadata=(?:"([^"]+)"|([^\s,]+))'
            match = re.search(pattern, www_auth_header)

            if not match:
                # Fallback to well-known discovery
                from urllib.parse import urlparse, urljoin

                parsed = urlparse(server_url)
                base_url = f"{parsed.scheme}://{parsed.netloc}"
                resource_metadata_url = urljoin(
                    base_url, "/.well-known/oauth-protected-resource"
                )
            else:
                resource_metadata_url = match.group(1) or match.group(2)

            logging.debug(f"Discovered resource metadata URL: {resource_metadata_url}")

            # Fetch protected resource metadata
            logging.debug("Fetching OAuth protected resource metadata...")
            metadata_response = await client.get(resource_metadata_url, headers=headers)

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

    async def _get_client_id_from_cloudformation(self) -> str:
        """Retrieve the OAuth client ID from CloudFormation stack outputs."""
        try:
            logging.debug(
                f"Retrieving client ID from CloudFormation stack: {self.oauth_config.auth_stack_name}"
            )

            session = boto3.Session()
            cf_client = session.client(
                "cloudformation", region_name=self.oauth_config.auth_stack_region
            )

            response = cf_client.describe_stacks(
                StackName=self.oauth_config.auth_stack_name
            )

            if not response.get("Stacks"):
                raise ValueError(
                    f"CloudFormation stack '{self.oauth_config.auth_stack_name}' not found"
                )

            stack = response["Stacks"][0]
            if not stack.get("Outputs"):
                raise ValueError(
                    f"No outputs found in CloudFormation stack '{self.oauth_config.auth_stack_name}'"
                )

            client_id_output = next(
                (
                    output
                    for output in stack["Outputs"]
                    if output["OutputKey"] == "AutomatedOAuthClientId"
                ),
                None,
            )

            if not client_id_output or not client_id_output.get("OutputValue"):
                raise ValueError(
                    f"AutomatedOAuthClientId output not found in CloudFormation stack '{self.oauth_config.auth_stack_name}'"
                )

            client_id = client_id_output["OutputValue"]
            logging.debug(f"Retrieved client ID: {client_id}")
            return client_id

        except ClientError as error:
            error_code = error.response["Error"]["Code"]
            if error_code == "ValidationException":
                raise ValueError(
                    f"CloudFormation stack '{self.oauth_config.auth_stack_name}' does not exist or is not accessible"
                )
            elif error_code in ["AccessDenied", "UnauthorizedOperation"]:
                raise ValueError(
                    f"Insufficient permissions to access CloudFormation stack '{self.oauth_config.auth_stack_name}'. "
                    "Ensure your AWS credentials have cloudformation:DescribeStacks permission."
                )
            else:
                raise ValueError(
                    f"Could not retrieve OAuth client ID from CloudFormation stack {self.oauth_config.auth_stack_name}: {error}"
                )

        except Exception as error:
            logging.error(f"Failed to retrieve client ID from CloudFormation:", error)
            raise ValueError(
                f"Could not retrieve OAuth client ID from CloudFormation stack {self.oauth_config.auth_stack_name}: {error}"
            )

    async def _get_client_secret_from_secrets_manager(self) -> str:
        """Retrieve the client secret from AWS Secrets Manager."""
        try:
            # First get the secret ARN from CloudFormation
            logging.debug("Retrieving client secret ARN from CloudFormation...")

            session = boto3.Session()
            cf_client = session.client(
                "cloudformation", region_name=self.oauth_config.auth_stack_region
            )

            response = cf_client.describe_stacks(
                StackName=self.oauth_config.auth_stack_name
            )

            if not response.get("Stacks"):
                raise ValueError(
                    f"CloudFormation stack '{self.oauth_config.auth_stack_name}' not found"
                )

            stack = response["Stacks"][0]
            if not stack.get("Outputs"):
                raise ValueError(
                    f"No outputs found in CloudFormation stack '{self.oauth_config.auth_stack_name}'"
                )

            secret_arn_output = next(
                (
                    output
                    for output in stack["Outputs"]
                    if output["OutputKey"] == "OAuthClientSecretArn"
                ),
                None,
            )

            if not secret_arn_output or not secret_arn_output.get("OutputValue"):
                raise ValueError(
                    f"OAuthClientSecretArn output not found in CloudFormation stack '{self.oauth_config.auth_stack_name}'"
                )

            secret_arn = secret_arn_output["OutputValue"]
            logging.debug(f"Retrieved secret ARN: {secret_arn}")

            # Now get the secret value from Secrets Manager
            logging.debug("Retrieving client secret from Secrets Manager...")

            secrets_client = session.client(
                "secretsmanager", region_name=self.oauth_config.auth_stack_region
            )

            secret_response = secrets_client.get_secret_value(SecretId=secret_arn)

            if not secret_response.get("SecretString"):
                raise ValueError("No secret string found in Secrets Manager response")

            logging.debug("Successfully retrieved client secret")
            return secret_response["SecretString"]

        except ClientError as error:
            error_code = error.response["Error"]["Code"]
            if error_code == "ResourceNotFoundException":
                raise ValueError(
                    "OAuth client secret not found in Secrets Manager. Ensure the secret exists and the ARN is correct."
                )
            elif error_code in ["AccessDenied", "UnauthorizedOperation"]:
                raise ValueError(
                    "Insufficient permissions to access Secrets Manager. Ensure your AWS credentials have secretsmanager:GetSecretValue permission."
                )
            else:
                raise ValueError(f"Could not retrieve OAuth client secret: {error}")

        except Exception as error:
            logging.error(f"Failed to retrieve client secret:", error)
            raise ValueError(f"Could not retrieve OAuth client secret: {error}")

    async def _get_server_url_from_cloudformation(self) -> str:
        """Retrieve the server URL from CloudFormation stack outputs."""
        try:
            logging.debug(
                f"Retrieving server URL from CloudFormation stack: {self.oauth_config.server_stack_name}"
            )

            session = boto3.Session()
            cf_client = session.client(
                "cloudformation", region_name=self.oauth_config.server_stack_region
            )

            response = cf_client.describe_stacks(
                StackName=self.oauth_config.server_stack_name
            )

            if not response.get("Stacks"):
                raise ValueError(
                    f"CloudFormation stack '{self.oauth_config.server_stack_name}' not found"
                )

            stack = response["Stacks"][0]
            if not stack.get("Outputs"):
                raise ValueError(
                    f"No outputs found in CloudFormation stack '{self.oauth_config.server_stack_name}'"
                )

            server_url_output = next(
                (
                    output
                    for output in stack["Outputs"]
                    if output["OutputKey"]
                    == self.oauth_config.server_stack_url_output_key
                ),
                None,
            )

            if not server_url_output or not server_url_output.get("OutputValue"):
                raise ValueError(
                    f"Server URL output not found in CloudFormation stack. Output key: {self.oauth_config.server_stack_url_output_key}"
                )

            server_url = server_url_output["OutputValue"]
            logging.debug(f"Retrieved server URL: {server_url}")
            return server_url

        except ClientError as error:
            error_code = error.response["Error"]["Code"]
            if error_code == "ValidationException":
                raise ValueError(
                    f"CloudFormation stack '{self.oauth_config.server_stack_name}' does not exist or is not accessible"
                )
            elif error_code in ["AccessDenied", "UnauthorizedOperation"]:
                raise ValueError(
                    f"Insufficient permissions to access CloudFormation stack '{self.oauth_config.server_stack_name}'. "
                    "Ensure your AWS credentials have cloudformation:DescribeStacks permission."
                )
            else:
                raise ValueError(
                    f"Could not retrieve server URL from CloudFormation stack {self.oauth_config.server_stack_name}: {error}"
                )

        except Exception as error:
            logging.error(f"Failed to retrieve server URL from CloudFormation:", error)
            raise ValueError(
                f"Could not retrieve server URL from CloudFormation stack {self.oauth_config.server_stack_name}: {error}"
            )
