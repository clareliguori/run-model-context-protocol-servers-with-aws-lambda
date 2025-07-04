"""
Tests for MCP Lambda handlers.
"""

import json
from typing import Union
from unittest.mock import Mock

import pytest
from aws_lambda_typing.context import Context as LambdaContext
from aws_lambda_typing.events import APIGatewayProxyEventV1 as APIGatewayProxyEvent
from aws_lambda_typing.events import APIGatewayProxyEventV2
from mcp.types import INTERNAL_ERROR, METHOD_NOT_FOUND, ErrorData, JSONRPCError, JSONRPCRequest, JSONRPCResponse

from mcp_lambda.handlers import (
    APIGatewayProxyEventHandler,
    APIGatewayProxyEventV2Handler,
    LambdaFunctionURLEventHandler,
    RequestHandler,
)


class TestRequestHandler(RequestHandler):
    """Test implementation of RequestHandler."""
    
    def handle_request(
        self, request: JSONRPCRequest, context: LambdaContext
    ) -> Union[JSONRPCResponse, JSONRPCError]:
        """Handle test requests."""
        if request.method == "ping":
            return JSONRPCResponse(
                jsonrpc="2.0",
                result={"message": "pong"},
                id=request.id,
            )
        elif request.method == "error":
            return JSONRPCError(
                jsonrpc="2.0",
                error=ErrorData(
                    code=INTERNAL_ERROR,
                    message="Test error",
                ),
                id=request.id,
            )
        else:
            return JSONRPCError(
                jsonrpc="2.0",
                error=ErrorData(
                    code=METHOD_NOT_FOUND,
                    message="Method not found",
                ),
                id=request.id,
            )


@pytest.fixture
def mock_context():
    """Create a mock Lambda context."""
    context = Mock(spec=LambdaContext)
    context.function_name = "test-function"
    context.function_version = "1"
    context.invoked_function_arn = "arn:aws:lambda:us-east-1:123456789012:function:test-function"
    context.memory_limit_in_mb = 128
    context.remaining_time_in_millis = lambda: 30000
    context.request_id = "test-request-id"
    context.log_group_name = "/aws/lambda/test-function"
    context.log_stream_name = "2023/01/01/[$LATEST]test-stream"
    return context


@pytest.fixture
def test_request_handler():
    """Create a test request handler."""
    return TestRequestHandler()


class TestAPIGatewayProxyEventHandler:
    """Tests for APIGatewayProxyEventHandler."""

    @pytest.fixture
    def handler(self, test_request_handler):
        """Create handler instance."""
        return APIGatewayProxyEventHandler(test_request_handler)

    def test_parse_event(self, handler):
        """Test parsing API Gateway proxy event."""
        event: APIGatewayProxyEvent = {
            "httpMethod": "POST",
            "headers": {"Content-Type": "application/json", "Accept": "application/json"},
            "multiValueHeaders": {},
            "body": '{"jsonrpc": "2.0", "method": "ping", "id": 1}',
            "resource": "/test",
            "path": "/test",
            "pathParameters": None,
            "queryStringParameters": None,
            "multiValueQueryStringParameters": {},
            "stageVariables": None,
            "requestContext": {
                "accountId": "123456789012",
                "apiId": "test-api",
                "httpMethod": "POST",
                "requestId": "test-request",
                "resourceId": "test-resource",
                "resourcePath": "/test",
                "stage": "test",
                "identity": {
                    "sourceIp": "127.0.0.1",
                    "userAgent": "test-agent",
                },
            },
            "isBase64Encoded": False,
        }

        parsed = handler.parse_event(event)
        assert parsed.method == "POST"
        assert parsed.headers["Content-Type"] == "application/json"
        assert parsed.body == '{"jsonrpc": "2.0", "method": "ping", "id": 1}'

    
    def test_successful_request(self, handler, mock_context):
        """Test successful JSON-RPC request."""
        event: APIGatewayProxyEvent = {
            "httpMethod": "POST",
            "headers": {"Content-Type": "application/json", "Accept": "application/json"},
            "multiValueHeaders": {},
            "body": '{"jsonrpc": "2.0", "method": "ping", "id": 1}',
            "resource": "/test",
            "path": "/test",
            "pathParameters": None,
            "queryStringParameters": None,
            "multiValueQueryStringParameters": {},
            "stageVariables": None,
            "requestContext": {
                "accountId": "123456789012",
                "apiId": "test-api",
                "httpMethod": "POST",
                "requestId": "test-request",
                "resourceId": "test-resource",
                "resourcePath": "/test",
                "stage": "test",
                "identity": {
                    "sourceIp": "127.0.0.1",
                    "userAgent": "test-agent",
                },
            },
            "isBase64Encoded": False,
        }

        result = handler.handle(event, mock_context)
        
        assert result["statusCode"] == 200
        assert result["headers"]["Content-Type"] == "application/json"
        
        response_body = json.loads(result["body"])
        assert response_body["jsonrpc"] == "2.0"
        assert response_body["result"]["message"] == "pong"
        assert response_body["id"] == 1

    
    def test_cors_preflight(self, handler, mock_context):
        """Test CORS preflight request."""
        event: APIGatewayProxyEvent = {
            "httpMethod": "OPTIONS",
            "headers": {},
            "multiValueHeaders": {},
            "body": None,
            "resource": "/test",
            "path": "/test",
            "pathParameters": None,
            "queryStringParameters": None,
            "multiValueQueryStringParameters": {},
            "stageVariables": None,
            "requestContext": {
                "accountId": "123456789012",
                "apiId": "test-api",
                "httpMethod": "OPTIONS",
                "requestId": "test-request",
                "resourceId": "test-resource",
                "resourcePath": "/test",
                "stage": "test",
                "identity": {
                    "sourceIp": "127.0.0.1",
                    "userAgent": "test-agent",
                },
            },
            "isBase64Encoded": False,
        }

        result = handler.handle(event, mock_context)
        
        assert result["statusCode"] == 200
        assert result["headers"]["Access-Control-Allow-Origin"] == "*"
        assert result["headers"]["Access-Control-Allow-Methods"] == "POST, GET, OPTIONS"
        assert result["body"] == ""

    
    def test_invalid_method(self, handler, mock_context):
        """Test invalid HTTP method."""
        event: APIGatewayProxyEvent = {
            "httpMethod": "PUT",
            "headers": {},
            "multiValueHeaders": {},
            "body": None,
            "resource": "/test",
            "path": "/test",
            "pathParameters": None,
            "queryStringParameters": None,
            "multiValueQueryStringParameters": {},
            "stageVariables": None,
            "requestContext": {
                "accountId": "123456789012",
                "apiId": "test-api",
                "httpMethod": "PUT",
                "requestId": "test-request",
                "resourceId": "test-resource",
                "resourcePath": "/test",
                "stage": "test",
                "identity": {
                    "sourceIp": "127.0.0.1",
                    "userAgent": "test-agent",
                },
            },
            "isBase64Encoded": False,
        }

        result = handler.handle(event, mock_context)
        
        assert result["statusCode"] == 405
        assert result["headers"]["Allow"] == "POST, OPTIONS"


class TestAPIGatewayProxyEventV2Handler:
    """Tests for APIGatewayProxyEventV2Handler."""

    @pytest.fixture
    def handler(self, test_request_handler):
        """Create handler instance."""
        return APIGatewayProxyEventV2Handler(test_request_handler)

    def test_parse_event(self, handler):
        """Test parsing API Gateway V2 event."""
        event: APIGatewayProxyEventV2 = {
            "version": "2.0",
            "routeKey": "POST /test",
            "rawPath": "/test",
            "rawQueryString": "",
            "headers": {"Content-Type": "application/json", "Accept": "application/json"},
            "body": '{"jsonrpc": "2.0", "method": "ping", "id": 1}',
            "requestContext": {
                "accountId": "123456789012",
                "apiId": "test-api",
                "domainName": "test.execute-api.us-east-1.amazonaws.com",
                "domainPrefix": "test",
                "http": {
                    "method": "POST",
                    "path": "/test",
                    "protocol": "HTTP/1.1",
                    "sourceIp": "127.0.0.1",
                    "userAgent": "test-agent",
                },
                "requestId": "test-request",
                "routeKey": "POST /test",
                "stage": "$default",
                "time": "01/Jan/2023:00:00:00 +0000",
                "timeEpoch": 1672531200,
            },
            "isBase64Encoded": False,
        }

        parsed = handler.parse_event(event)
        assert parsed.method == "POST"
        assert parsed.headers["Content-Type"] == "application/json"
        assert parsed.body == '{"jsonrpc": "2.0", "method": "ping", "id": 1}'

    
    def test_successful_request(self, handler, mock_context):
        """Test successful JSON-RPC request."""
        event: APIGatewayProxyEventV2 = {
            "version": "2.0",
            "routeKey": "POST /test",
            "rawPath": "/test",
            "rawQueryString": "",
            "headers": {"Content-Type": "application/json", "Accept": "application/json"},
            "body": '{"jsonrpc": "2.0", "method": "ping", "id": 1}',
            "requestContext": {
                "accountId": "123456789012",
                "apiId": "test-api",
                "domainName": "test.execute-api.us-east-1.amazonaws.com",
                "domainPrefix": "test",
                "http": {
                    "method": "POST",
                    "path": "/test",
                    "protocol": "HTTP/1.1",
                    "sourceIp": "127.0.0.1",
                    "userAgent": "test-agent",
                },
                "requestId": "test-request",
                "routeKey": "POST /test",
                "stage": "$default",
                "time": "01/Jan/2023:00:00:00 +0000",
                "timeEpoch": 1672531200,
            },
            "isBase64Encoded": False,
        }

        result = handler.handle(event, mock_context)
        
        assert result["statusCode"] == 200
        assert result["headers"]["Content-Type"] == "application/json"
        
        response_body = json.loads(result["body"])
        assert response_body["jsonrpc"] == "2.0"
        assert response_body["result"]["message"] == "pong"
        assert response_body["id"] == 1


class TestLambdaFunctionURLEventHandler:
    """Tests for LambdaFunctionURLEventHandler."""

    @pytest.fixture
    def handler(self, test_request_handler):
        """Create handler instance."""
        return LambdaFunctionURLEventHandler(test_request_handler)

    
    def test_successful_request(self, handler, mock_context):
        """Test successful JSON-RPC request."""
        # Lambda Function URLs use the same event format as API Gateway V2
        event: APIGatewayProxyEventV2 = {
            "version": "2.0",
            "routeKey": "$default",
            "rawPath": "/",
            "rawQueryString": "",
            "headers": {"Content-Type": "application/json", "Accept": "application/json"},
            "body": '{"jsonrpc": "2.0", "method": "ping", "id": 1}',
            "requestContext": {
                "accountId": "123456789012",
                "apiId": "test-function-url",
                "domainName": "test-function-url.lambda-url.us-east-1.on.aws",
                "domainPrefix": "test-function-url",
                "http": {
                    "method": "POST",
                    "path": "/",
                    "protocol": "HTTP/1.1",
                    "sourceIp": "127.0.0.1",
                    "userAgent": "test-agent",
                },
                "requestId": "test-request",
                "routeKey": "$default",
                "stage": "$default",
                "time": "01/Jan/2023:00:00:00 +0000",
                "timeEpoch": 1672531200,
            },
            "isBase64Encoded": False,
        }

        result = handler.handle(event, mock_context)
        
        assert result["statusCode"] == 200
        assert result["headers"]["Content-Type"] == "application/json"
        
        response_body = json.loads(result["body"])
        assert response_body["jsonrpc"] == "2.0"
        assert response_body["result"]["message"] == "pong"
        assert response_body["id"] == 1
