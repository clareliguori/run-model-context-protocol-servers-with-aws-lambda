#!/bin/bash

set -ex

export LOG_LEVEL=debug

cd e2e_tests/

# Run the Python integ test
cd python/
uv pip install -r requirements.txt
python main.py

# Run the Typescript integ test
cd ../typescript/
npm ci
npm link @aws/run-mcp-servers-with-aws-lambda
npm run build
npm test
