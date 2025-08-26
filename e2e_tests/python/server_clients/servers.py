import asyncio
import logging

from server_clients.server import Server
from server_clients.tool import Tool
from typing import Any


class Servers:
    """Class for managing multiple MCP servers."""

    def __init__(self, servers: list[Server]) -> None:
        self.servers: list[Server] = servers

    async def __aenter__(self):
        """Async context manager entry"""
        logging.info("Starting servers")
        initialized_servers = []
        for server in self.servers:
            logging.info(f"Starting server: {server.name}")
            initialized_server = await self._initialize_server_with_retry(server)
            initialized_servers.append(initialized_server)

        self.servers = initialized_servers
        return self

    async def _initialize_server_with_retry(
        self, server: Server, retries: int = 3, delay: float = 1.0
    ) -> Server:
        """Initialize a server with retry mechanism"""
        attempt = 0
        while attempt < retries:
            try:
                return await server.__aenter__()
            except Exception as e:
                attempt += 1
                logging.warning(
                    f"Error initializing server {server.name}: {e}. Attempt {attempt} of {retries}."
                )

                try:
                    await server.__aexit__(None, None, None)
                except Exception as exit_error:
                    logging.warning(
                        f"Error closing server {server.name} during retry: {exit_error}"
                    )

                if attempt < retries:
                    logging.info(f"Retrying in {delay} seconds...")
                    await asyncio.sleep(delay)
                else:
                    logging.error(
                        f"Max retries reached for server {server.name}. Failing."
                    )
                    raise Exception(
                        f"Error initializing server {server.name}: {str(e)}"
                    )

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        logging.info("Stopping servers")
        for server in reversed(self.servers):
            logging.info(f"Stopping server: {server.name}")
            await server.__aexit__(exc_type, exc_val, exc_tb)

    async def list_tools(self) -> list[Tool]:
        """List all tools from all servers"""
        tools = []
        for server in self.servers:
            tools.extend(await server.list_tools())
        return tools

    async def find_server_with_tool(self, tool_name: str) -> Server:
        """Find the server that has the given tool"""
        for server in self.servers:
            tools = await server.list_tools()
            if any(tool.name == tool_name for tool in tools):
                return server
        raise ValueError(f"Tool {tool_name} not found in any server")

    async def execute_tool(
        self, tool_name: str, tool_use_id: str, arguments: str
    ) -> Any:
        """Execute the given tool on the appropriate server"""
        try:
            server = await self.find_server_with_tool(tool_name)

            result = await server.execute_tool(
                tool_name=tool_name,
                tool_use_id=tool_use_id,
                arguments=arguments,
            )

            return {"toolResult": result}
        except ValueError:
            return {
                "toolResult": {
                    "toolUseId": tool_use_id,
                    "content": [{"text": f"No server found with tool: {tool_name}"}],
                    "status": "error",
                }
            }
