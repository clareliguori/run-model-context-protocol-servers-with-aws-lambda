# Book Search Remote MCP Server

This remote MCP server wraps the [mcp-openapi-proxy](https://pypi.org/project/mcp-openapi-proxy/)
stdio-based MCP server in a Lambda function. The server is configured with a simplified OpenAPI
specification for the [Open Library Search API](https://openlibrary.org/dev/docs/api/search).

- Language: Python
- Transport: Streamable HTTP transport
- Authentication: OAuth
- Endpoint: Bedrock AgentCore Gateway

### Deploy

```bash
uv pip install -r requirements.txt

cdk deploy --app 'python3 cdk_stack.py'

cd gateway_setup/

uv pip install -r requirements.txt

python ./setup_gateway.py
```

See the [development guide](/DEVELOP.md) for full instructions to deploy and run the examples in this repository.
