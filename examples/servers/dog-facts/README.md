# Dog Breeds Facts Remote MCP Server

This remote MCP server wraps the [@ivotoby/openapi-mcp-server](https://www.npmjs.com/package/@ivotoby/openapi-mcp-server)
stdio-based MCP server in a Lambda function. The server is configured with a simplified OpenAPI specification for the
[thedogapi.com](https://thedogapi.com/) API.

- Language: Typescript
- Transport: Streamable HTTP transport
- Authentication: OAuth
- Endpoint: API Gateway

### Setup API Key

1. Create a free API key at [https://thedogapi.com/](https://thedogapi.com/)
2. Store the API key in AWS Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name "mcp-lambda-examples-dog-api-key" \
  --description "API key for thedogapi.com" \
  --secret-string "your-api-key-here"
```

### Deploy

```bash
npm install

npm link @aws/run-mcp-servers-with-aws-lambda

npm run build

cdk deploy --app 'node lib/dog-facts-mcp-server.js'
```

See the [development guide](/DEVELOP.md) for full instructions to deploy and run the examples in this repository.
