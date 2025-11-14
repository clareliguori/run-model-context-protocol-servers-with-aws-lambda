"""Tests for backwards compatibility wrapper streamable_http_sigv4."""

from unittest.mock import ANY, AsyncMock, patch

import pytest
from botocore.credentials import Credentials

from mcp_lambda.client.streamable_http_sigv4 import streamablehttp_client_with_sigv4


class TestStreamableHttpClientWithSigV4:
    """Test backwards compatibility wrapper."""

    @pytest.mark.asyncio
    async def test_wrapper_calls_new_client(self):
        """Test that wrapper correctly calls aws_iam_streamablehttp_client."""
        credentials = Credentials("test_key", "test_secret")

        with patch(
            "mcp_lambda.client.streamable_http_sigv4.aws_iam_streamablehttp_client"
        ) as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock(
                return_value=("read", "write", "callback")
            )
            mock_client.return_value.__aexit__ = AsyncMock(return_value=None)

            async with streamablehttp_client_with_sigv4(
                url="https://example.com",
                credentials=credentials,
                service="lambda",
                region="us-west-2",
            ) as result:
                assert result == ("read", "write", "callback")

            mock_client.assert_called_once_with(
                endpoint="https://example.com",
                aws_service="lambda",
                aws_region="us-west-2",
                credentials=credentials,
                headers=None,
                timeout=30,
                sse_read_timeout=300,
                terminate_on_close=True,
                httpx_client_factory=ANY,
            )

    def test_function_signature_compatibility(self):
        """Test that function signature matches original for backwards compatibility."""
        import inspect

        sig = inspect.signature(streamablehttp_client_with_sigv4)

        # Verify required parameters exist
        assert "url" in sig.parameters
        assert "credentials" in sig.parameters
        assert "service" in sig.parameters
        assert "region" in sig.parameters
