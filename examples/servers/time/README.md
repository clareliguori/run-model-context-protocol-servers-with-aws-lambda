# Time Remote MCP server

This remote MCP server wraps the [time](https://pypi.org/project/mcp-server-time/) stdio-based MCP server in a Lambda function.

- Language: Python
- Transport: Custom Lambda Invoke transport
- Authentication: AWS IAM
- Endpoint: Lambda Invoke API

### Deploy

```bash
uv pip install -r requirements.txt

cdk deploy --app 'python3 cdk_stack.py'
```

See the [development guide](/DEVELOP.md) for full instructions to deploy and run the examples in this repository.

### Testing

Sample inputs:

```bash
uv pip install -r function/requirements.txt

# Initialize
$ python -c 'from function import index; print(index.handler({"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{"listChanged":True}},"clientInfo":{"name":"mcp","version":"0.1.0"}},"jsonrpc":"2.0","id":0}, ""))'

# List tools
$ python -c 'from function import index; print(index.handler({"method":"tools/list","params":{"clientInfo":{"name":"mcp","version":"0.1.0"}},"jsonrpc":"2.0","id":0}, ""))'
```
