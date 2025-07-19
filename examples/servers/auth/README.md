# MCP Auth Stack

This CDK stack creates AWS Cognito resources for OAuth authentication/authorization to be used with the example MCP (Model Context Protocol) servers.

### Deploy

```bash
npm install

npm run build

cdk deploy --app 'node lib/mcp-auth.js'
```

See the [development guide](/DEVELOP.md) for full instructions to deploy and run the examples in this repository.
