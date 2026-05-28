# Auth setup

The workflows support two auth modes for calling Claude. Pick one.

## Mode 1: Bedrock OIDC (preferred)

**Why:** no API key to rotate; AWS-side rate limits and billing controls; no key in your repo secrets.

**Trade-off:** requires an AWS account with Bedrock model access in `us-east-1`, `us-east-2`, and `us-west-2` (cross-region inference profiles route across all three).

### Setup

1. **Create an IAM role** in your AWS account that:
   - Trusts `token.actions.githubusercontent.com` (OIDC provider)
   - Restricts `sub` to your repo, e.g.
     ```
     "token.actions.githubusercontent.com:sub": "repo:YOUR-ORG/YOUR-REPO:*"
     ```
   - Has a policy granting `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on:
     - `arn:aws:bedrock:us-east-*::foundation-model/anthropic.claude-*`
     - `arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-*`

2. **Enable Bedrock model access** in the AWS console for Claude Sonnet 4.5 and Haiku 4.5 in `us-east-1`, `us-east-2`, and `us-west-2`.

3. **Add the role ARN** to your repo: Settings → Secrets and variables → Actions → New repository secret → `AWS_BEDROCK_ROLE_ARN` = `arn:aws:iam::123456789012:role/my-github-bedrock`.

4. **Set the region** (optional): Variables → `AWS_REGION` = `us-east-2`.

### IAM trust policy example

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:YOUR-ORG/YOUR-REPO:*"
      }
    }
  }]
}
```

### IAM permissions policy example

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
    "Resource": [
      "arn:aws:bedrock:us-east-1::foundation-model/anthropic.*",
      "arn:aws:bedrock:us-east-2::foundation-model/anthropic.*",
      "arn:aws:bedrock:us-west-2::foundation-model/anthropic.*",
      "arn:aws:bedrock:us-east-1:*:inference-profile/us.anthropic.*",
      "arn:aws:bedrock:us-east-2:*:inference-profile/us.anthropic.*",
      "arn:aws:bedrock:us-west-2:*:inference-profile/us.anthropic.*"
    ]
  }]
}
```

## Mode 2: Anthropic API key

**Why:** simplest setup; no AWS.

**Trade-off:** an API key sits in your repo secrets; you eat the full Anthropic API cost; rate limits apply at the workspace level.

### Setup

1. Get an API key from [console.anthropic.com](https://console.anthropic.com).
2. Add it to your repo: Settings → Secrets and variables → Actions → New repository secret → `ANTHROPIC_API_KEY`.
3. **Set the model IDs** to Anthropic API model IDs (not Bedrock inference profile IDs):
   - `MODEL_REVIEW` = `claude-sonnet-4-5-20250929`
   - `MODEL_INTAKE` = `claude-haiku-4-5-20251001`
   - `MODEL_PILOT` = `claude-sonnet-4-5-20250929`
   - `MODEL_REVISE` = `claude-haiku-4-5-20251001`

If both `AWS_BEDROCK_ROLE_ARN` and `ANTHROPIC_API_KEY` are set, the workflows use Bedrock. To switch, delete the Bedrock secret.

## Verifying auth

After setup, trigger the simplest workflow (`code-review.yml`) by opening a test PR. If auth is broken you'll see one of:
- `AccessDeniedException` in the Bedrock step → check IAM trust policy and model access
- `401 Unauthorized` → check the API key
- `Could not assume role with OIDC` → check the `sub` condition in trust policy matches your repo path

## Workflow modification guard

> ⚠️ If you modify a workflow file that uses `claude-code-action` in a PR, that workflow's own validation may fail on the PR (the action can't validate itself against an untrusted modification). Use admin-bypass merge for those PRs.
