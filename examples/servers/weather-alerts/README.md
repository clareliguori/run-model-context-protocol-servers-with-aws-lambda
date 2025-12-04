# Weather Alerts Remote MCP server

This remote MCP server wraps the [@ivotoby/openapi-mcp-server](https://www.npmjs.com/package/@ivotoby/openapi-mcp-server)
stdio-based MCP server in a Lambda function. The server is configured with a simplified OpenAPI specification for the
[National Weather Service API](https://www.weather.gov/documentation/services-web-api).

- Language: Typescript
- Transport: Custom Lambda Invoke transport
- Authentication: AWS IAM
- Endpoint: Lambda Invoke API

### Deploy

```bash
npm install

npm link @aws/run-mcp-servers-with-aws-lambda

npm run build

cdk deploy --app 'node lib/weather-alerts-mcp-server.js'
```

See the [development guide](/DEVELOP.md) for full instructions to deploy and run the examples in this repository.
