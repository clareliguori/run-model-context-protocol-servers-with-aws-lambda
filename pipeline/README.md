# MCP Servers Deployment Pipeline

This directory contains a CDK pipeline that automates the deployment of all MCP (Model Context Protocol) servers in the `examples/servers/` directory.

### Setup

**Customize repo and org name:**

Edit `src/pipeline-stack.ts` and update the CodeStar Connections source action:

```typescript
owner: 'your-github-username',
repo: 'your-repo-name',
```

**Customize domain name:**

Edit `examples/servers/auth/lib/mcp-auth.ts` and replace `liguori.people.aws.dev` with your domain name.

**Bootstrap the CDK:**

```bash
cdk bootstrap aws://ACCOUNT-ID/us-west-2
```

**Create the CodeBuild role:**

```
aws iam create-role \
  --role-name mcp-servers-codebuild \
  --assume-role-policy-document file://codebuild-assume-role-policy.json

aws iam attach-role-policy \
  --role-name mcp-servers-codebuild \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess

aws iam put-role-policy \
  --role-name mcp-servers-codebuild \
  --policy-name inline \
  --policy-document file://codebuild-role-policy.json
```

### Deploy the pipeline

```bash
npm install
npm run build
npm run deploy
```

### Activate the GitHub connection and pipeline

After deployment, you'll see `CodeConnectionsConsoleUrl` and `PipelineConsoleUrl` outputs.

Complete the connection setup:

1. Click on the Code Connections console URL. Click "Update pending connection" and authorize with GitHub. When finished, the connection should have the "Available" status.
2. Click on the Pipeline console URL. Click "Release change".
