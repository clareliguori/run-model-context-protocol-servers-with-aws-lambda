import json
import logging
import os
from typing import Any
from contextlib import ExitStack

from botocore.config import Config
from strands import Agent
from strands.models import BedrockModel
from mcp_clients import (
    create_stdio_client,
    create_lambda_function_client,
    create_lambda_function_url_client,
    create_automated_oauth_client,
)

# Configure logging
logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper()),
    format="%(asctime)s - %(levelname)s - %(message)s",
)

# Suppress boto3 credential info messages
logging.getLogger("boto3").setLevel(logging.WARNING)
logging.getLogger("botocore").setLevel(logging.WARNING)
logging.getLogger("strands").setLevel(logging.WARNING)


def load_config(file_path: str) -> dict[str, Any]:
    """Load server configuration from JSON file."""
    with open(file_path, "r") as f:
        return json.load(f)


def main() -> None:
    """Initialize and run the chat session."""
    server_config = load_config("servers_config.json")
    user_utterances = load_config("../test_questions.json")

    # Create MCP clients for all server types
    mcp_clients = []

    # Add stdio servers
    for name, srv_config in server_config.get("stdioServers", {}).items():
        client = create_stdio_client(name, srv_config)
        mcp_clients.append((name, client))
        logging.info(f"Added stdio server: {name}")

    # Add lambda function servers
    for name, srv_config in server_config.get("lambdaFunctionServers", {}).items():
        client = create_lambda_function_client(name, srv_config)
        mcp_clients.append((name, client))
        logging.info(f"Added lambda function server: {name}")

    # Add lambda function URL servers
    for name, srv_config in server_config.get("lambdaFunctionUrls", {}).items():
        client = create_lambda_function_url_client(name, srv_config)
        mcp_clients.append((name, client))
        logging.info(f"Added lambda function URL server: {name}")

    # Add OAuth servers
    for name, srv_config in server_config.get("oAuthServers", {}).items():
        client = create_automated_oauth_client(name, srv_config)
        mcp_clients.append((name, client))
        logging.info(f"Added OAuth server: {name}")

    if not mcp_clients:
        raise RuntimeError(
            "No MCP clients were successfully created. Cannot start chatbot without tools."
        )

    # Create Bedrock model
    retry_config = Config(
        retries={
            "max_attempts": 10,
            "mode": "standard",
        }
    )
    bedrock_model = BedrockModel(
        model_id="global.anthropic.claude-haiku-4-5-20251001-v1:0",
        region_name="us-west-2",
        streaming=False,
        boto_client_config=retry_config,
    )

    # Create agent with MCP tools (agent will start them)
    agent = Agent(
        model=bedrock_model,
        tools=[client for _, client in mcp_clients],
        system_prompt="You are a helpful assistant.  Always retry tool call failures to recover from issues like transient network errors.",
    )

    # List tools from each MCP client
    for name, client in mcp_clients:
        tools = client.list_tools_sync()
        logging.info(f"Tools from {name}: {[t.tool_name for t in tools]}")

    # Run test utterances
    for i, user_input in enumerate(user_utterances):
        print(f"\nYou: {user_input}")
        print(f"\nAssistant: ")
        agent(user_input)


if __name__ == "__main__":
    main()
