# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.4.1](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.4.0...v0.4.1) (2025-08-25)


### Features

* Create AgentCore Gateway service role for integ tests ([3b9054a](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/3b9054a7685d574155e18032280e6f29c7464503))
* Directly use Cognito OAuth metadata endpoint instead of API Gateway redirect ([fc7bdbc](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/fc7bdbcd402c76b26c3975502961483474b9b386))
* Examples for Bedrock AgentCore Gateway ([30fe751](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/30fe751e2e29939dfbc12c755e4dd26474330eaa))
* Major fixes for Bedrock AgentCore Gateway support ([180c62b](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/180c62b16913340fb356941eee2ca88744d276ab))
* Move examples to us-west-2 to be able to use Bedrock AgentCore Gateway (not available right now in us-east-2) ([ba84b3c](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/ba84b3c48c41d686fd7ee280695e844958b08f3b))
* remove custom OAuth metadata server ([6b61e9f](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/6b61e9f83e63528ec1b055d4e7ab36fa1e913d2f))
* Support for SSM parameters in integ tests ([0b8d517](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/0b8d5171fb61ad44553cc87ae8e417ab8699aa3a))
* Use Claude 3.7 Sonnet in chatbots and e2e tests ([78db957](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/78db957a297dd4f2d420f0a5d154b4415998dc23))


### Bug Fixes

* Add back CDK nag suppressions ([ba630f5](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/ba630f5adc01621684d3f1cc7a3a3bc01dbf0a07))
* Add back Gateway-based integ tests ([d450cd6](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/d450cd660dac2469c61fdab2130fe3c459c30351))
* Add Bedrock AgentCore Gateway permissions for integ tests ([c9164f5](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/c9164f5d4ef7ceadfc5c75f146cfb317f62d063b))
* Add more debugging for OAuth flow requests ([bdbc0d2](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/bdbc0d2f9e32d72de8c3022ce73b08a56b823858))
* Add other AgentCore permissions used by Gateway ([cae57be](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/cae57be29c955aaaa85f60bab933560339d56829))
* additional perms for integ tests ([4d37967](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/4d379676df35fc0d6c169a50a3f372fd81e35f2a))
* Authorize integ tests to use any Bedrock model ([a1e83f3](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/a1e83f38ee413524dcebc4cb7a70d6dd2bff1681))
* Be specific about which mcpdoc tools to use ([fd4312a](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/fd4312a2f426a7bc955e4b40ae4c55fd1fcdc32a))
* Create CodeBuild IAM role outside of pipeline stack ([6f12635](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/6f12635d10dbd5d5de0efa7387f070418a4bfb5e))
* explicitly invoke mcpdoc in e2e tests ([4e0b70d](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/4e0b70d7e77d4edfcdc6cae370db54153cd1b065))
* explicitly invoke mcpdoc in e2e tests (python) ([a30c487](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/a30c48762308634cf6312c8a2e4866672901583d))
* Fail integ tests if tool execution fails ([8ac8b42](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/8ac8b42d55508f2af61b67d6a90f2917a71b3573))
* follow redirects for OAuth endpoint requests ([f02d02a](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/f02d02a15d06732f5c651c7a4f1747b64000afdc))
* Increase retries for Gateway client ([e67bcdf](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/e67bcdf1a9bb4ea0b58e978740886b23d34b20a2))
* Let integ tests pass gateway role ([50813a0](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/50813a0848bcf24fb1c87548ee0400197d65fec6))
* Make a POST request to discover OAuth metadata, not a GET ([aa219c4](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/aa219c4c5e11506a3bf3b935611b16cbbaebab3b))
* Make the sample mcpdoc prompt more specific to make sure the model selects mcpdoc tools ([4c88ea4](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/4c88ea43a40cdf3e5da7ffaa01babe7e30359158))
* Port OAuth fixes from interactive clients to automated clients ([c771e67](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/c771e67b037b56e330a58159d61eb3844221db2a))
* Send a valid ping request instead of empty object ([ae9ec46](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/ae9ec467bb0f5fb9fb3e46ff8829b464365789fe))
* strip trailing dashes from gateway names ([98a7948](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/98a794832f19adfbbe8336e8eec7051b57251a95))
* Temporarily comment out e2e test utterances for Gateway-based servers ([f01ff14](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/f01ff14f2dc8c48697eb9d474be513f7988cd526))
* Temporarily remove integ tests for Gateway ([51399f4](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/51399f428470f9481ecdc1ea624cf08c269a7d74))
* Truncate gateway names in integ tests ([1a4e73f](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/1a4e73fb710758659ecb7f316aa24d4d6f8b121d))
* Update SSM param permissions for integ tests ([700c58a](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/700c58a0fae8c2331ec83ee1e9f0895fdb52dce1))
* Use new discovery mechanism for OAuth metadata ([fe0bac8](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/fe0bac8af08d0063c573206df5c789e4162ff717))
* Wait for interactive OAuth callback server to shutdown before completing OAuth flow ([a692308](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/a69230870f56da80083cc123d1d22a89d93022e6))
* workaround AgentCore Gateways returning 404 for GET requests ([53137e1](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/53137e136832e912c1325b33d112aeb75db64206))

## [0.4.0](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.3.5...v0.4.0) (2025-08-19)


### ⚠ BREAKING CHANGES

* Migrate from aws-lambda-typing to aws-lambda-powertools for Lambda types

### Features

* Migrate from aws-lambda-typing to aws-lambda-powertools for Lambda types ([36f743e](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/36f743e8b172d730d4aed7bae7a92e260e815dbf))
* support for Bedrock AgentCore Gateway Lambda targets ([f7833a9](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/f7833a9b418cb742ec39339ea72884d993e97bbc))


### Bug Fixes

* default values for http event ([b9d13fd](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/b9d13fd4f37f5851dea472ef9cac94f1688fb9bd))
* Match filenames to class names ([731ae67](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/731ae6779f42c345be06ecb608f77285eddc712c))

## [0.3.5](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.3.4...v0.3.5) (2025-08-12)


### Features

* Automated OAuth client with client creds for integ tests ([13d6f2a](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/13d6f2a0752cb4ab1f1e4d60bb75dea7884c9ebe))
* Sample OAuth stack no longer needs to assemble OAuth configuration in Lambda function ([6cb6a23](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/6cb6a236de213b5a4acb294f57051031b2718653))


### Bug Fixes

* Increase discovery endpoint throttle limits ([8d55308](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/8d55308d935e16a223027740949885d3fbd499a9))

## [0.3.4](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.3.3...v0.3.4) (2025-08-05)


### Features

* OAuth client implementation for Python chatbot ([6f74065](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/6f74065ee3b0f5da4c8ebc9d5d8de93890f2c0bc))


### Bug Fixes

* catch-all for exceptions in adapter ([90e478c](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/90e478c9c8e002a2f08f4db3e98175cefb2ffb1b))
* Increase duration of dad-jokes function to prevent timeouts ([e37b7a8](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/e37b7a88aacb0c54cee0805462690c50a5e20478))

## [0.3.3](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.3.2...v0.3.3) (2025-07-29)


### Bug Fixes

* Add debug logging to Python request handlers ([1d27998](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/1d27998110c28617677c510f1b12034346228276))

## [0.3.2](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.3.1...v0.3.2) (2025-07-22)

## [0.3.1](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.3.0...v0.3.1) (2025-07-15)


### Features

* Pipeline stack ([743ab0f](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/743ab0f5ebb92c4657aa2f356173d3ea6a2d1f58))


### Bug Fixes

* Add missing grant_types_supported to OAuth server metadata ([4b79b49](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/4b79b490ae35632aa6c4ca9f8678fd64aee4b31c))

## [0.3.0](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.2.4...v0.3.0) (2025-07-09)


### ⚠ BREAKING CHANGES

* Use camelCase for Typescript file names

### Features

* Use camelCase for Typescript file names ([e0723b9](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/e0723b9184c7998a0cdfe9bb8873058082d516ff))

## [0.2.4](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.2.3...v0.2.4) (2025-07-08)


### Features

* sigv4 streamable HTTP transport client - Typescript implementation ([401d064](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/401d0649a33b7a03d7159c6946c74e0f778047b0))


### Bug Fixes

* linting error for use of any ([1499986](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/1499986c1dacf415ea91d3418c2d13cbabea70dc))

## [0.2.3](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.2.2...v0.2.3) (2025-07-08)


### Features

* Streamable HTTP transport client with SigV4 - Python implementation ([332cd43](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/332cd43232c8821730fa36d7579e589bb40624bd))


### Bug Fixes

* Ruff failures ([3f26e62](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/3f26e622c2b4ded3edbffa44d330cabd5cab0f8a))

## [0.2.2](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.2.1...v0.2.2) (2025-07-06)


### Features

* Add API GW that serves up the .well-known/oauth-authorization-server path expected by MCP clients ([d282fa9](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/d282fa97f274bf54babe10c09f13cd9f9d94151a))
* Add function URL to cat-facts MCP server to enable testing HTTP transport ([8212c2c](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/8212c2c9b1e4593fe9d47e42d066366c46730f95))
* Add Lambda function URL to mcpdoc example ([0764b90](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/0764b903154daf34f4b603e316b2aab226705df4))
* Add Python mcpdoc example that can be the base for a streamable HTTP example ([4943cf3](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/4943cf384bd64df92a30a02e1dc44fdb0fbb4e97))
* Add separate handlers for API Gateway (REST APIs), API Gateway V2 (HTTP APIs), and Lambda function URLs to Typescript impl ([19d2fb4](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/19d2fb448fcfc065d0edcb205cbbfda783aee138))
* Add Typescript cat-facts example that can be the base for a streamable HTTP example ([4b0de89](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/4b0de8978ca626a9746796d9e1632b2a8e26d07b))
* Cognito user pool with OAuth for HTTP access to MCP servers ([de51f6c](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/de51f6c04fded26bd4d53ce89c76ed9971fa22cf))
* Lambda handler logic for streamable HTTP transport behind Lambda function URL ([69208ba](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/69208ba3e74acf23c9b5c7d1e148817df9fea906))
* Migrate from deprecated openapi-mcp-server package to @ivotoby/openapi-mcp-server ([5f9a670](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/5f9a6707a188941cc349fd4b161863c7bb27642c))
* Python function handlers for streamable HTTP ([7c46144](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/7c461449b202d068c562f1bda45c4d949d75da05))
* Support interactive OAuth servers in the Typescript chatbot ([05561fc](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/05561fcbf7878e384c58812406db32986ada4da1))
* Typescript dog-facts MCP server that authenticates with OAuth ([7154adf](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/7154adf8c1954286642a67c7058f1e9e1bca7471))
* Typescript integ test support for OAuth client ([1f7492f](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/1f7492f880910be26bbbf0ff10951bf599b476f9))
* Typescript-based cat-facts MCP server accessible behind Lambda function URL using streamable HTTP transport and Sigv4 ([4a6e83f](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/4a6e83f356063298ef3bf07b030e533633400150))


### Bug Fixes

* Actually initialize the automated oauth clients ([21e76cc](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/21e76cce398e787566fe4203b54d005238494b5c))
* Add dad-jokes server to Typescript chatbot and integ tests ([694e370](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/694e3708c99e96e476f706372669017e293a84bb))
* Correct module path for mcpdoc ([f3b779c](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/f3b779c0ea8daf07c983998ac8ae3eab41986855))
* Disable synthesizing during auth stack GitHub actions check ([23f46d7](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/23f46d7499828942a04d0a2305491ac2ae5e87ac))
* extra comma made cat facts openAPI schema invalid ([3425ee6](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/3425ee6cab11bba3682e8c7f7e24339ad8f4e26e))
* Grant correct secret retrieval perm to integ tests ([c3dae9b](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/c3dae9b2eabfb6df0c463f7ac0aa39bf20a0ae06))
* Implement client credentials token exchange directly ([2db8380](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/2db8380ff2d003f0b5d1c4fb7d8f6d3ba2d0b3c8))
* Implement codeVerifier methods for automated Oauth provider ([ab75d7c](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/ab75d7c3d9f585c82c24be81a7d69840feb58fe4))
* Make sure the cat-facts MCP server advertises that its random facts are about cats ([b26c082](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/b26c0828cc5ddc3d137b490eb6e2a8510093f163))
* Match e2e test Python client pause to the Typescript one ([e735343](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/e735343104e3aa57ac2bee3cd2372d3ecebd05b0))
* Properly parse tool call results from latest schema for MCP Python SDK ([1ee3f06](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/1ee3f06218ef2507a4473757a41e6b9543cb13ba))
* Reduce token usage in e2e_tests to avoid Bedrock token throttling ([bf44cc7](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/bf44cc75e7055d2e220f30672204357a59c5867d))
* Set Bedrock client backoff to handle per-minute throttles ([9a0f6d4](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/9a0f6d423c8f718b664ef3ce7f0cfd48fd19468b))
* Strip down the cat facts OpenAPI schema to save on Bedrock tokens ([c0fd66c](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/c0fd66c645b7dbefa7f616e66d9fee49ebee0925))
* Switch Oauth scope mcpdoc for dad-jokes ([2bed651](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/2bed6519ff55d5dc8835f0b664bc338003d3a2be))
* Switch OAuth-enabled MCP server from cat-facts to dog-facts ([a5041e3](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/a5041e38775c25aa6beb03fc35b2bd1c3a42110e))
* Use authorization server URL to get OAuth token, not MCP server URL ([11ab57c](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/11ab57cd51492aabe1a417d5e38557a0aa4ca406))
* Use CallToolResult type from MCP SDK to properly parse tool results ([a27489c](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/a27489c4eb5ee17ba51cdda07f2e98ee24884902))

## [0.2.1](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.2.0...v0.2.1) (2025-06-03)

## [0.2.0](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.1.6...v0.2.0) (2025-05-30)

MCP 1.8.0 [introduced a new format for MCP client messages (SessionMessage)](https://github.com/modelcontextprotocol/python-sdk/commit/da0cf223553d50e48fba7652b2ef0eca26550e77).
This 0.2.0 version upgrades the MCP version from MCP 1.6.0 to 1.9.2, and uses the new SessionMessage format for the Lambda client-side transport.

### ⚠ BREAKING CHANGES

* Use new MCP SessionMessage for Lambda client transport

### Features

* Use new MCP SessionMessage for Lambda client transport ([35125c5](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/35125c5e22172544c5a07f17c4174e1b4c792fea))

## [0.1.6](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.1.5...v0.1.6) (2025-05-27)


### Bug Fixes

* Format response text from server in example client implementation ([c0523cf](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/commit/c0523cf087422726a657a6c5866af1c0fbaa24d3))

## [0.1.5](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.1.4...v0.1.5) (2025-05-13)

## [0.1.4](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.1.3...v0.1.4) (2025-04-22)

## [0.1.3](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.1.2...v0.1.3) (2025-04-15)

## [0.1.1](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.1.0...v0.1.1) (2025-04-15)

## [0.0.2](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda/compare/v0.0.1...v0.0.2) (2025-04-01)
