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
