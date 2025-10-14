import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { Code, LayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Role } from "aws-cdk-lib/aws-iam";
import { CfnGateway, CfnGatewayTarget } from "aws-cdk-lib/aws-bedrockagentcore";
import { AwsSolutionsChecks } from "cdk-nag";
import * as path from "path";
import * as fs from "fs";

export class DictionaryMcpServer extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    stackNameSuffix: string,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    // For testing, the @aws/run-mcp-servers-with-aws-lambda package is bundled from local files.
    // Remove this layer if using the @aws/run-mcp-servers-with-aws-lambda package from npm.
    const mcpLambdaLayer = new LayerVersion(this, "McpLambdaLayer", {
      code: Code.fromAsset(path.join(__dirname, "../../../../src/typescript"), {
        bundling: {
          image: Runtime.NODEJS_22_X.bundlingImage,
          command: [
            "bash",
            "-c",
            [
              "mkdir -p /asset-output/nodejs/node_modules/@aws/run-mcp-servers-with-aws-lambda",
              `cp -r /asset-input/* /asset-output/nodejs/node_modules/@aws/run-mcp-servers-with-aws-lambda/`,
            ].join(" && "),
          ],
        },
      }),
      compatibleRuntimes: [Runtime.NODEJS_22_X],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const logGroup = new LogGroup(this, "LogGroup", {
      logGroupName: "mcp-server-dictionary" + stackNameSuffix,
      retention: RetentionDays.ONE_DAY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const serverFunction = new NodejsFunction(this, "function", {
      functionName: "mcp-server-dictionary" + stackNameSuffix,
      role: Role.fromRoleName(this, "role", "mcp-lambda-example-servers"),
      logGroup,
      memorySize: 2048,
      runtime: Runtime.NODEJS_22_X,
      environment: {
        LOG_LEVEL: "DEBUG",
      },
      layers: [mcpLambdaLayer],
      bundling: {
        format: OutputFormat.ESM,
        mainFields: ["module", "main"],
        nodeModules: ["@ivotoby/openapi-mcp-server"],
        // For testing, the @aws/run-mcp-servers-with-aws-lambda package is bundled from local files using the Lambda layer above.
        // Remove the layer and this externalModules configuration if using the @aws/run-mcp-servers-with-aws-lambda package from npm.
        externalModules: ["@aws/run-mcp-servers-with-aws-lambda"],
        commandHooks: {
          beforeBundling(inputDir: string, outputDir: string): string[] {
            return [];
          },
          afterBundling(inputDir: string, outputDir: string): string[] {
            return [
              `cp ${inputDir}/free-dictionary-openapi.json ${outputDir}/`,
            ];
          },
          beforeInstall(inputDir: string, outputDir: string) {
            return [];
          },
        },
      },
    });

    // Load tools configuration
    const toolsConfig = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../gateway-tools-list.json"), "utf8")
    );

    // Get gateway name with length limit
    let gatewayName = `LambdaMcpServer-Dictionary-Gateway${stackNameSuffix}`;
    if (gatewayName.length > 48) {
      gatewayName = gatewayName.substring(0, 48).replace(/-+$/, '');
    }

    const gateway = new CfnGateway(this, "Gateway", {
      name: gatewayName,
      roleArn: `arn:aws:iam::${this.account}:role/mcp-lambda-example-agentcore-gateways`,
      protocolType: "MCP",
      authorizerType: "CUSTOM_JWT",
      authorizerConfiguration: {
        customJwtAuthorizer: {
          allowedClients: [
            cdk.Fn.importValue("LambdaMcpServer-Auth-InteractiveOAuthClientId"),
            cdk.Fn.importValue("LambdaMcpServer-Auth-AutomatedOAuthClientId"),
          ],
          discoveryUrl: cdk.Fn.sub(
            "${IssuerDomain}/.well-known/openid-configuration",
            {
              IssuerDomain: cdk.Fn.importValue("LambdaMcpServer-Auth-IssuerDomain"),
            }
          ),
        },
      },
      exceptionLevel: "DEBUG",
    });

    new CfnGatewayTarget(this, "GatewayTarget", {
      gatewayIdentifier: gateway.attrGatewayIdentifier,
      name: "dictionary-target",
      targetConfiguration: {
        mcp: {
          lambda: {
            lambdaArn: serverFunction.functionArn,
            toolSchema: { inlinePayload: toolsConfig.tools },
          },
        },
      },
      credentialProviderConfigurations: [
        { credentialProviderType: "GATEWAY_IAM_ROLE" },
      ],
    });

    new cdk.CfnOutput(this, "ServerFunctionOutput", {
      value: serverFunction.functionArn,
    });

    new cdk.CfnOutput(this, "GatewayIdOutput", {
      value: gateway.attrGatewayIdentifier,
    });

    new cdk.CfnOutput(this, "GatewayUrlOutput", {
      value: gateway.attrGatewayUrl,
    });
  }
}

const app = new cdk.App();
const stackNameSuffix =
  "INTEG_TEST_ID" in process.env ? `-${process.env["INTEG_TEST_ID"]}` : "";
const stack = new DictionaryMcpServer(
  app,
  "LambdaMcpServer-Dictionary",
  stackNameSuffix,
  {
    env: { account: process.env["CDK_DEFAULT_ACCOUNT"], region: "us-west-2" },
    stackName: "LambdaMcpServer-Dictionary" + stackNameSuffix,
  }
);
cdk.Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: true }));
app.synth();
