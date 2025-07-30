# Dad Jokes Remote MCP Server

This remote MCP server wraps the [mcp-openapi-proxy](https://pypi.org/project/mcp-openapi-proxy/)
stdio-based MCP server in a Lambda function. The server is configured with a simplified OpenAPI specification for the
[icanhazdadjoke](https://icanhazdadjoke.com/api) API.

- Language: Python
- Transport: Streamable HTTP transport
- Authentication: AWS IAM
- Endpoint: API Gateway

### Deploy

```bash
uv pip install -r requirements.txt

cdk deploy --app 'python3 cdk_stack.py'
```

See the [development guide](/DEVELOP.md) for full instructions to deploy and run the examples in this repository.

### Local Testing

Sample inputs:

```bash
cd function

uv pip install -r requirements.txt

# Initialize
$ python -c 'import index; print(index.handler({"httpMethod": "POST", "headers": {"Accept": "application/json, text/event-stream", "content-type": "application/json"}, "body": "{\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{},\"clientInfo\":{\"name\":\"mcp\",\"version\":\"0.1.0\"}},\"jsonrpc\":\"2.0\",\"id\":0}"}, ""))'

# List tools
$ python -c 'import index; print(index.handler({"httpMethod": "POST", "headers": {"Accept": "application/json, text/event-stream", "content-type": "application/json"}, "body": "{\"method\":\"tools/list\",\"params\":{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{},\"clientInfo\":{\"name\":\"mcp\",\"version\":\"0.1.0\"}},\"jsonrpc\":\"2.0\",\"id\":0}"}, ""))'
```

```
{"httpMethod": "POST", "headers": {"Accept": "application/json, text/event-stream", "content-type": "application/json"}, "body": "{\"method\":\"tools/list\",\"params\":{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{},\"clientInfo\":{\"name\":\"mcp\",\"version\":\"0.1.0\"}},\"jsonrpc\":\"2.0\",\"id\":0}"}
```
