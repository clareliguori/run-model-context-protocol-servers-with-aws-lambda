# mcpdoc Remote MCP Server

This remote MCP server wraps the [mcpdoc](https://pypi.org/project/mcpdoc/) stdio-based MCP server in a Lambda function.
The server is configured to fetch llms.txt documentation for the [Strands Agents SDK](https://strandsagents.com/).

- Language: Python
- Transport: Custom Streamable HTTP transport with SigV4 support
- Authentication: AWS IAM
- Endpoint: Lambda Function URL

### Deploy

```bash
uv pip install -r requirements.txt

cdk deploy --app 'python3 cdk_stack.py'
```

See the [development guide](/DEVELOP.md) for full instructions to deploy and run the examples in this repository.
