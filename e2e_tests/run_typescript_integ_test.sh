#!/bin/bash

set -ex

export LOG_LEVEL=debug

cd e2e_tests/typescript

# Pre-cache mcp-server-fetch and trigger readabilipy's npm install
# by making an actual fetch request (readabilipy installs node packages on first use)
npx @modelcontextprotocol/inspector --cli uvx mcp-server-fetch --ignore-robots-txt --method tools/call --tool-name fetch --tool-arg url=https://httpbin.org/html > /dev/null 2>&1 || true

# Run the Typescript integ test
npm ci
npm link @aws/run-mcp-servers-with-aws-lambda
npm run build
npm test
