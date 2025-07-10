# Dog Facts Remote MCP Server

This remote MCP server wraps the [@ivotoby/openapi-mcp-server](https://www.npmjs.com/package/@ivotoby/openapi-mcp-server)
stdio-based MCP server in a Lambda function. The server is configured with a simplified OpenAPI specification for the
[dogapi.dog](https://dogapi.dog/) API.

- Language: Typescript
- Transport: Streamable HTTP transport
- Authentication: AWS IAM
- Endpoint: API Gateway

### Deploy

```bash
npm install

npm link @aws/run-mcp-servers-with-aws-lambda

npm run build

cdk deploy --app 'node lib/dog-facts-mcp-server.js'
```

See the [development guide](/DEVELOP.md) for full instructions to deploy and run the examples in this repository.
