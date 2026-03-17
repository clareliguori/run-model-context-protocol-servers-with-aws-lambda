#!/bin/bash

set -ex

export LOG_LEVEL=debug

cd e2e_tests/typescript

# Pre-install mcp-server-fetch to avoid uvx download issues in CI
uv pip install mcp-server-fetch

# Run the Typescript integ test
npm ci
npm link @aws/run-mcp-servers-with-aws-lambda
npm run build
npm test
