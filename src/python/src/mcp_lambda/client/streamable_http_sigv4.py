"""
Backwards compatibility wrapper for streamable_http_sigv4.

This module provides backwards compatibility for the old streamablehttp_client_with_sigv4
function by wrapping the new aws_iam_streamablehttp_client from mcp-proxy-for-aws.
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import timedelta

from anyio.streams.memory import MemoryObjectReceiveStream, MemoryObjectSendStream
from botocore.credentials import Credentials
from mcp.client.streamable_http import GetSessionIdCallback
from mcp.shared._httpx_utils import McpHttpClientFactory, create_mcp_http_client
from mcp.shared.message import SessionMessage
from mcp_proxy_for_aws.client import aws_iam_streamablehttp_client


@asynccontextmanager
async def streamablehttp_client_with_sigv4(
    url: str,
    credentials: Credentials,
    service: str,
    region: str,
    headers: dict[str, str] | None = None,
    timeout: float | timedelta = 30,
    sse_read_timeout: float | timedelta = 60 * 5,
    terminate_on_close: bool = True,
    httpx_client_factory: McpHttpClientFactory = create_mcp_http_client,
) -> AsyncGenerator[
    tuple[
        MemoryObjectReceiveStream[SessionMessage | Exception],
        MemoryObjectSendStream[SessionMessage],
        GetSessionIdCallback,
    ],
    None,
]:
    """
    Backwards compatibility wrapper for streamablehttp_client_with_sigv4.

    This function wraps the new aws_iam_streamablehttp_client for backwards compatibility.
    """
    async with aws_iam_streamablehttp_client(
        endpoint=url,
        aws_service=service,
        aws_region=region,
        credentials=credentials,
        headers=headers,
        timeout=timeout,
        sse_read_timeout=sse_read_timeout,
        terminate_on_close=terminate_on_close,
        httpx_client_factory=httpx_client_factory,
    ) as result:
        yield result
