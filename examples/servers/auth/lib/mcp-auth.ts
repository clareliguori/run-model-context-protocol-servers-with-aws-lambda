import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  UserPool,
  OAuthScope,
  ResourceServerScope,
  UserPoolResourceServer,
  CfnUserPoolUser,
} from "aws-cdk-lib/aws-cognito";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";

export class McpAuthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Cognito User Pool
    const userPool = new UserPool(this, "McpAuthUserPool", {
      userPoolName: `mcp-lambda-examples`,
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
        username: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cdk.aws_cognito.AccountRecovery.NONE,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      standardThreatProtectionMode:
        cdk.aws_cognito.StandardThreatProtectionMode.FULL_FUNCTION,
      featurePlan: cdk.aws_cognito.FeaturePlan.PLUS,
    });

    // Create a user in the user pool
    new CfnUserPoolUser(this, "McpAuthUser", {
      userPoolId: userPool.userPoolId,
      username: "mcp-user",
      userAttributes: [
        {
          name: "email",
          value: "mcp-user@example.com",
        },
        {
          name: "email_verified",
          value: "true",
        },
      ],
      messageAction: "SUPPRESS",
    });

    const userCredentialsSecret = new Secret(this, "McpUserPassword", {
      secretName: `mcp-lambda-examples-user-creds`,
      description: "Credentials for MCP user",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "mcp-user" }),
        generateStringKey: "password",
        excludeCharacters: '"@/\\',
        includeSpace: false,
        passwordLength: 16,
        requireEachIncludedType: true,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    NagSuppressions.addResourceSuppressions(userCredentialsSecret, [
      {
        id: "AwsSolutions-SMG4",
        reason:
          "Credentials will not be automatically rotated for this example.",
      },
    ]);

    // Create User Pool Domain
    userPool.addDomain("McpAuthUserPoolDomain", {
      cognitoDomain: {
        domainPrefix: `mcp-lambda-examples-${this.account}`,
      },
    });

    // Scope for each MCP server that will use this user pool.
    // The scope name must match the URL path for the MCP server
    // in the API gateway.
    const mcpServers = ["mcpdoc", "cat-facts"];
    const resourceServerScopes = mcpServers.map(
      (mcpServer) =>
        new ResourceServerScope({
          scopeName: mcpServer,
          scopeDescription: `Scope for ${mcpServer} MCP server`,
        })
    );
    const resourceServer = new UserPoolResourceServer(this, "ResourceServer", {
      identifier: "mcp-resource-server",
      userPool: userPool,
      scopes: resourceServerScopes,
    });
    const oauthScopes = resourceServerScopes.map((scope) =>
      OAuthScope.resourceServer(resourceServer, scope)
    );

    // OAuth client for interactive chatbots:
    // The client will redirect users to the browser for sign-in
    const interactiveClient = userPool.addClient("InteractiveClient", {
      generateSecret: false,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: cdk.Duration.minutes(60),
      refreshTokenValidity: cdk.Duration.days(60),
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: oauthScopes,
        callbackUrls: [
          "http://localhost:9876/callback", // For local testing with oauth2c
        ],
      },
      authFlows: {
        userPassword: true,
      },
    });

    // OAuth client for automated integration tests:
    // The client will provide a client secret for the access token
    const automatedClient = userPool.addClient("AutomatedClient", {
      generateSecret: true,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: cdk.Duration.minutes(60),
      refreshTokenValidity: cdk.Duration.days(60),
      oAuth: {
        flows: {
          clientCredentials: true,
        },
        scopes: oauthScopes,
      },
      authFlows: {},
    });

    const automatedClientSecret = new Secret(this, "AutomatedClientSecret", {
      secretName: `mcp-lambda-examples-oauth-client-secret`,
      description: "Client secret for automated MCP client",
      secretStringValue: automatedClient.userPoolClientSecret,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    NagSuppressions.addResourceSuppressions(automatedClientSecret, [
      {
        id: "AwsSolutions-SMG4",
        reason:
          "OAuth client secret will not be automatically rotated for this example",
      },
    ]);

    // Outputs with export names for cross-stack references
    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
      description: "Cognito User Pool ID",
      exportName: "McpAuth-UserPoolId",
    });

    new cdk.CfnOutput(this, "UserPoolDomain", {
      value: userPool.userPoolProviderUrl,
      description: "Cognito User Pool Domain URL",
      exportName: "McpAuth-UserPoolDomain",
    });

    new cdk.CfnOutput(this, "AuthorizationUrl", {
      value: `${userPool.userPoolProviderUrl}/oauth2/authorize`,
      description: "OAuth Authorization URL",
      exportName: "McpAuth-AuthorizationUrl",
    });

    new cdk.CfnOutput(this, "TokenUrl", {
      value: `${userPool.userPoolProviderUrl}/oauth2/token`,
      description: "OAuth Token URL",
      exportName: "McpAuth-TokenUrl",
    });

    new cdk.CfnOutput(this, "InteractiveOAuthClientId", {
      value: interactiveClient.userPoolClientId,
      description: "Client ID for interactive OAuth flow",
      exportName: "McpAuth-InteractiveClientId",
    });

    new cdk.CfnOutput(this, "AutomatedOAuthClientId", {
      value: automatedClient.userPoolClientId,
      description: "Client ID for automated OAuth flow",
      exportName: "McpAuth-AutomatedClientId",
    });

    new cdk.CfnOutput(this, "OAuthClientSecretArn", {
      value: automatedClientSecret.secretArn,
      description: "ARN of the secret containing the OAuth client secret",
      exportName: "McpAuth-ClientSecretArn",
    });

    new cdk.CfnOutput(this, "UserCredentialsSecretArn", {
      value: userCredentialsSecret.secretArn,
      description:
        "ARN of the secret containing the login credentials for mcp-user",
      exportName: "McpAuth-UserCredentialsArn",
    });
  }
}

const app = new cdk.App();
const stack = new McpAuthStack(app, "LambdaMcpServer-Auth", {
  env: { account: process.env["CDK_DEFAULT_ACCOUNT"], region: "us-east-2" },
  stackName: "LambdaMcpServer-Auth",
});

// Add CDK NAG suppressions for the entire stack
NagSuppressions.addStackSuppressions(stack, [
  {
    id: "AwsSolutions-IAM4",
    reason:
      "AWS managed policies are acceptable for CDK custom resource Lambda functions (created to retrieve OAuth client secret)",
    appliesTo: [
      "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    ],
  },
]);

cdk.Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: true }));
app.synth();
