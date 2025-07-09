# Cat Facts Remote MCP Server

This remote MCP server wraps the [@ivotoby/openapi-mcp-server](https://www.npmjs.com/package/@ivotoby/openapi-mcp-server)
stdio-based MCP server in a Lambda function. The server is configured with a simplified OpenAPI specification for the
[catfact.ninja](https://catfact.ninja/) API.

- Language: Typescript
- Transport: Custom Streamable HTTP transport with SigV4 support
- Authentication: AWS IAM
- Endpoint: Lambda Function URL

### Deploy

```bash
npm install

npm link @aws/run-mcp-servers-with-aws-lambda

npm run build

cdk deploy --app 'node lib/cat-facts-mcp-server.js'
```
