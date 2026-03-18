/**
 * IAM Drift Intelligence — TechCorp Demo Dataset
 *
 * TechCorp is a mid-size SaaS company (account 111122223333) running a
 * microservices architecture on AWS. This dataset provides 10 pre-assessed
 * IAM roles spanning HIGH, MEDIUM, and LOW risk — with a complete item model
 * per role including policies, AI-generated content, and simulation results.
 *
 * Account IAM Health Score: 54/100
 *
 * Mix of review_decision states for demo realism:
 *   PENDING  — 6 roles (the active remediation queue)
 *   APPROVED — 2 roles (one applied, one ready-to-apply)
 *   REJECTED — 1 role  (reviewer disagreed with proposal)
 *   APPLIED  — 1 role  (already remediated for before/after demo)
 */

import { IamFinding, IamScan, IamAccount } from '../types';

// ─── Shared Constants ─────────────────────────────────────────────────────────

const ACCOUNT_ID = '111122223333';
const ACCOUNT_NAME = 'TechCorp';
const SCAN_ID = '2026-03-17-account-111122223333-scan-001';
const BASE_ARN = `arn:aws:iam::${ACCOUNT_ID}:role`;
const SCAN_CREATED = '2026-03-17T08:00:00Z';

// ─── Seed Findings — 10 Fully-Populated TechCorp Roles ───────────────────────

export const seedFindings: IamFinding[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // 1. cost-guardian-lambda-role — HIGH risk
  //    Wildcards on EC2 + S3; EC2 and SNS never used
  // ══════════════════════════════════════════════════════════════════════════
  {
    scan_id: SCAN_ID,
    role_id: `${BASE_ARN}/cost-guardian-lambda-role`,
    account_id: ACCOUNT_ID,
    role_name: 'cost-guardian-lambda-role',
    role_arn: `${BASE_ARN}/cost-guardian-lambda-role`,

    finding_status: 'READY',
    ai_status: 'COMPLETE',
    simulation_status: 'COMPLETE',
    workflow_state: 'ready_for_review',
    next_action_required: 'reviewer_decision_needed',
    review_decision: 'PENDING',

    risk_score: 14,
    risk_level: 'HIGH',
    wildcard_actions: ['ec2:*', 's3:*'],
    wildcard_resources: ['*'],
    unused_services: ['ec2', 'sns'],
    last_used_date: '2026-02-01T00:00:00Z',

    permission_count_before: 23,
    permission_count_after: 7,
    permission_reduction_pct: 69.6,
    services_before: ['s3', 'ec2', 'sns', 'dynamodb', 'lambda'],
    services_after: ['s3', 'dynamodb'],

    current_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'S3FullAccess',
          Effect: 'Allow',
          Action: 's3:*',
          Resource: '*',
        },
        {
          Sid: 'EC2FullAccess',
          Effect: 'Allow',
          Action: 'ec2:*',
          Resource: '*',
        },
        {
          Sid: 'SNSPublish',
          Effect: 'Allow',
          Action: ['sns:Publish', 'sns:ListTopics'],
          Resource: '*',
        },
        {
          Sid: 'DynamoDBAccess',
          Effect: 'Allow',
          Action: [
            'dynamodb:PutItem',
            'dynamodb:GetItem',
            'dynamodb:UpdateItem',
            'dynamodb:Query',
          ],
          Resource: `arn:aws:dynamodb:us-east-1:${ACCOUNT_ID}:table/cost-metrics`,
        },
        {
          Sid: 'LambdaInvoke',
          Effect: 'Allow',
          Action: ['lambda:InvokeFunction'],
          Resource: `arn:aws:lambda:us-east-1:${ACCOUNT_ID}:function:cost-guardian-*`,
        },
      ],
    },
    proposed_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'S3CostReportsBucketRead',
          Effect: 'Allow',
          Action: ['s3:GetObject', 's3:ListBucket'],
          Resource: [
            `arn:aws:s3:::techcorp-cost-reports`,
            `arn:aws:s3:::techcorp-cost-reports/*`,
          ],
        },
        {
          Sid: 'DynamoDBCostMetricsWrite',
          Effect: 'Allow',
          Action: [
            'dynamodb:PutItem',
            'dynamodb:GetItem',
            'dynamodb:UpdateItem',
            'dynamodb:Query',
          ],
          Resource: `arn:aws:dynamodb:us-east-1:${ACCOUNT_ID}:table/cost-metrics`,
        },
        {
          Sid: 'LambdaInvoke',
          Effect: 'Allow',
          Action: ['lambda:InvokeFunction'],
          Resource: `arn:aws:lambda:us-east-1:${ACCOUNT_ID}:function:cost-guardian-*`,
        },
      ],
    },
    applied_policy: null,
    policy_version: 1,
    policy_history: [],

    intent_summary: 'Read cost reports from S3 and write aggregated metrics to DynamoDB',
    actual_permissions_summary: 'Full S3 on all resources, full EC2 on all resources, SNS publish',
    intent_gap:
      'Role has unrestricted EC2 and S3 access far exceeding its cost-reporting purpose. EC2 permissions are entirely unused — likely copied from a template. SNS was used historically but no longer appears in CloudTrail.',
    abuse_scenario:
      'A compromised function could enumerate and terminate all EC2 instances across the account, exfiltrate data from every S3 bucket, or use SNS to send phishing messages to subscribed endpoints. The combination of compute control and data access creates a high-impact lateral movement path.',
    ai_confidence_score: 0.92,
    ai_confidence_note: null,

    simulation_result: 'PASS',
    simulation_actions_removed: [
      'ec2:DescribeInstances',
      'ec2:TerminateInstances',
      'ec2:RunInstances',
      'sns:Publish',
      'sns:ListTopics',
      's3:DeleteObject',
      's3:PutBucketPolicy',
    ],
    simulation_actions_preserved: [
      's3:GetObject',
      's3:ListBucket',
      'dynamodb:PutItem',
      'dynamodb:GetItem',
      'dynamodb:UpdateItem',
      'dynamodb:Query',
      'lambda:InvokeFunction',
    ],
    simulation_breaking_changes: [],

    blast_radius: {
      reachable_services: ['s3', 'ec2', 'sns', 'dynamodb', 'lambda'],
      critical_paths: ['ec2:TerminateInstances → production fleet', 's3:* → all company data'],
      risk_level: 'HIGH',
    },

    terraform_export: `resource "aws_iam_policy" "cost_guardian_least_privilege" {
  name        = "cost-guardian-lambda-least-privilege"
  description = "Least-privilege policy for cost-guardian-lambda-role (IAM Drift remediation 2026-03-17)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "S3CostReportsBucketRead"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:ListBucket"]
        Resource = [
          "arn:aws:s3:::techcorp-cost-reports",
          "arn:aws:s3:::techcorp-cost-reports/*"
        ]
      },
      {
        Sid    = "DynamoDBCostMetricsWrite"
        Effect = "Allow"
        Action = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:Query"]
        Resource = "arn:aws:dynamodb:us-east-1:${ACCOUNT_ID}:table/cost-metrics"
      },
      {
        Sid      = "LambdaInvoke"
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = "arn:aws:lambda:us-east-1:${ACCOUNT_ID}:function:cost-guardian-*"
      }
    ]
  })
}`,

    scan_created_at: SCAN_CREATED,
    last_updated_at: '2026-03-17T08:23:00Z',
    enrichment_completed_at: '2026-03-17T08:20:00Z',
    simulation_completed_at: '2026-03-17T08:22:00Z',
    reviewed_at: null,
    applied_at: null,
    rolled_back_at: null,

    reviewed_by: null,
    review_notes: null,
    alert_sent: true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 2. data-pipeline-role — HIGH risk
  //    Wildcards on S3 + DynamoDB on all resources; workflow_state: applied
  // ══════════════════════════════════════════════════════════════════════════
  {
    scan_id: SCAN_ID,
    role_id: `${BASE_ARN}/data-pipeline-role`,
    account_id: ACCOUNT_ID,
    role_name: 'data-pipeline-role',
    role_arn: `${BASE_ARN}/data-pipeline-role`,

    finding_status: 'READY',
    ai_status: 'COMPLETE',
    simulation_status: 'COMPLETE',
    workflow_state: 'applied',
    next_action_required: 'rollback_available',
    review_decision: 'APPROVED',

    risk_score: 16,
    risk_level: 'HIGH',
    wildcard_actions: ['s3:*', 'dynamodb:*'],
    wildcard_resources: ['*'],
    unused_services: [],
    last_used_date: '2026-03-16T22:00:00Z',

    permission_count_before: 18,
    permission_count_after: 9,
    permission_reduction_pct: 50.0,
    services_before: ['s3', 'dynamodb', 'glue', 'logs'],
    services_after: ['s3', 'dynamodb', 'logs'],

    current_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'S3FullAccess',
          Effect: 'Allow',
          Action: 's3:*',
          Resource: '*',
        },
        {
          Sid: 'DynamoDBFullAccess',
          Effect: 'Allow',
          Action: 'dynamodb:*',
          Resource: '*',
        },
        {
          Sid: 'GlueJobAccess',
          Effect: 'Allow',
          Action: ['glue:StartJobRun', 'glue:GetJobRun', 'glue:BatchStopJobRun'],
          Resource: '*',
        },
        {
          Sid: 'CloudWatchLogs',
          Effect: 'Allow',
          Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: 'arn:aws:logs:us-east-1:*:*',
        },
      ],
    },
    proposed_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'S3PipelineBuckets',
          Effect: 'Allow',
          Action: ['s3:GetObject', 's3:PutObject', 's3:ListBucket', 's3:DeleteObject'],
          Resource: [
            `arn:aws:s3:::techcorp-pipeline-input`,
            `arn:aws:s3:::techcorp-pipeline-input/*`,
            `arn:aws:s3:::techcorp-pipeline-output`,
            `arn:aws:s3:::techcorp-pipeline-output/*`,
          ],
        },
        {
          Sid: 'DynamoDBPipelineTables',
          Effect: 'Allow',
          Action: [
            'dynamodb:PutItem',
            'dynamodb:GetItem',
            'dynamodb:UpdateItem',
            'dynamodb:Query',
            'dynamodb:BatchWriteItem',
          ],
          Resource: [
            `arn:aws:dynamodb:us-east-1:${ACCOUNT_ID}:table/pipeline-jobs`,
            `arn:aws:dynamodb:us-east-1:${ACCOUNT_ID}:table/pipeline-output`,
          ],
        },
        {
          Sid: 'CloudWatchLogs',
          Effect: 'Allow',
          Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: `arn:aws:logs:us-east-1:${ACCOUNT_ID}:log-group:/aws/lambda/data-pipeline:*`,
        },
      ],
    },
    applied_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'S3PipelineBuckets',
          Effect: 'Allow',
          Action: ['s3:GetObject', 's3:PutObject', 's3:ListBucket', 's3:DeleteObject'],
          Resource: [
            `arn:aws:s3:::techcorp-pipeline-input`,
            `arn:aws:s3:::techcorp-pipeline-input/*`,
            `arn:aws:s3:::techcorp-pipeline-output`,
            `arn:aws:s3:::techcorp-pipeline-output/*`,
          ],
        },
        {
          Sid: 'DynamoDBPipelineTables',
          Effect: 'Allow',
          Action: [
            'dynamodb:PutItem',
            'dynamodb:GetItem',
            'dynamodb:UpdateItem',
            'dynamodb:Query',
            'dynamodb:BatchWriteItem',
          ],
          Resource: [
            `arn:aws:dynamodb:us-east-1:${ACCOUNT_ID}:table/pipeline-jobs`,
            `arn:aws:dynamodb:us-east-1:${ACCOUNT_ID}:table/pipeline-output`,
          ],
        },
        {
          Sid: 'CloudWatchLogs',
          Effect: 'Allow',
          Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: `arn:aws:logs:us-east-1:${ACCOUNT_ID}:log-group:/aws/lambda/data-pipeline:*`,
        },
      ],
    },
    policy_version: 2,
    policy_history: [
      {
        version: 1,
        policy: {
          Version: '2012-10-17',
          Statement: [
            { Sid: 'S3FullAccess', Effect: 'Allow', Action: 's3:*', Resource: '*' },
            { Sid: 'DynamoDBFullAccess', Effect: 'Allow', Action: 'dynamodb:*', Resource: '*' },
            {
              Sid: 'GlueJobAccess',
              Effect: 'Allow',
              Action: ['glue:StartJobRun', 'glue:GetJobRun', 'glue:BatchStopJobRun'],
              Resource: '*',
            },
            {
              Sid: 'CloudWatchLogs',
              Effect: 'Allow',
              Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
              Resource: 'arn:aws:logs:us-east-1:*:*',
            },
          ],
        },
        changed_at: '2026-03-17T09:00:00Z',
        changed_by: 'iam-drift-intelligence',
        change_reason: 'Initial remediation: replaced s3:*/dynamodb:* wildcards with scoped resource ARNs',
      },
    ],

    intent_summary: 'ETL pipeline reading from S3 input bucket and writing aggregated results to DynamoDB',
    actual_permissions_summary:
      'Full S3 and DynamoDB on all resources account-wide, Glue job control',
    intent_gap:
      'Role has full S3 and DynamoDB access on every resource in the account, but the pipeline only processes data from two specific S3 buckets and writes to two DynamoDB tables. Glue permissions were unused for 90+ days.',
    abuse_scenario:
      'A compromised pipeline could read every S3 bucket in the account (including secrets, backups, and PII data), drop or corrupt any DynamoDB table, and exfiltrate the full data warehouse. Cross-pipeline access contamination is a critical supply chain risk.',
    ai_confidence_score: 0.95,
    ai_confidence_note: null,

    simulation_result: 'PASS',
    simulation_actions_removed: [
      's3:DeleteBucket',
      's3:PutBucketPolicy',
      'dynamodb:DeleteTable',
      'dynamodb:CreateTable',
      'glue:StartJobRun',
    ],
    simulation_actions_preserved: [
      's3:GetObject',
      's3:PutObject',
      's3:ListBucket',
      's3:DeleteObject',
      'dynamodb:PutItem',
      'dynamodb:GetItem',
      'dynamodb:UpdateItem',
      'dynamodb:Query',
      'dynamodb:BatchWriteItem',
      'logs:PutLogEvents',
    ],
    simulation_breaking_changes: [],

    blast_radius: {
      reachable_services: ['s3', 'dynamodb', 'glue', 'logs'],
      critical_paths: [
        's3:* → all company data buckets',
        'dynamodb:* → all tables including user data',
      ],
      risk_level: 'HIGH',
    },

    terraform_export: `resource "aws_iam_policy" "data_pipeline_least_privilege" {
  name        = "data-pipeline-role-least-privilege"
  description = "Least-privilege policy for data-pipeline-role (IAM Drift remediation 2026-03-17)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3PipelineBuckets"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:DeleteObject"]
        Resource = [
          "arn:aws:s3:::techcorp-pipeline-input",
          "arn:aws:s3:::techcorp-pipeline-input/*",
          "arn:aws:s3:::techcorp-pipeline-output",
          "arn:aws:s3:::techcorp-pipeline-output/*"
        ]
      },
      {
        Sid    = "DynamoDBPipelineTables"
        Effect = "Allow"
        Action = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:BatchWriteItem"]
        Resource = [
          "arn:aws:dynamodb:us-east-1:${ACCOUNT_ID}:table/pipeline-jobs",
          "arn:aws:dynamodb:us-east-1:${ACCOUNT_ID}:table/pipeline-output"
        ]
      }
    ]
  })
}`,

    scan_created_at: SCAN_CREATED,
    last_updated_at: '2026-03-17T10:15:00Z',
    enrichment_completed_at: '2026-03-17T08:25:00Z',
    simulation_completed_at: '2026-03-17T08:27:00Z',
    reviewed_at: '2026-03-17T09:00:00Z',
    applied_at: '2026-03-17T09:05:00Z',
    rolled_back_at: null,

    reviewed_by: 'sarah.chen@techcorp.io',
    review_notes: 'Approved — scoped resources confirmed with pipeline team. Glue permissions intentionally removed (migrated to Step Functions).',
    alert_sent: true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 3. api-gateway-execution-role — MEDIUM risk
  //    Wildcard on lambda:*; lambda:DeleteFunction never used
  // ══════════════════════════════════════════════════════════════════════════
  {
    scan_id: SCAN_ID,
    role_id: `${BASE_ARN}/api-gateway-execution-role`,
    account_id: ACCOUNT_ID,
    role_name: 'api-gateway-execution-role',
    role_arn: `${BASE_ARN}/api-gateway-execution-role`,

    finding_status: 'READY',
    ai_status: 'COMPLETE',
    simulation_status: 'COMPLETE',
    workflow_state: 'ready_for_review',
    next_action_required: 'reviewer_decision_needed',
    review_decision: 'PENDING',

    risk_score: 9,
    risk_level: 'MEDIUM',
    wildcard_actions: ['lambda:*'],
    wildcard_resources: ['*'],
    unused_services: ['lambda:DeleteFunction', 'lambda:DeleteAlias', 'lambda:RemovePermission'],
    last_used_date: '2026-03-17T06:00:00Z',

    permission_count_before: 12,
    permission_count_after: 5,
    permission_reduction_pct: 58.3,
    services_before: ['lambda', 'logs'],
    services_after: ['lambda', 'logs'],

    current_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'LambdaFullAccess',
          Effect: 'Allow',
          Action: 'lambda:*',
          Resource: '*',
        },
        {
          Sid: 'CloudWatchLogs',
          Effect: 'Allow',
          Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: '*',
        },
      ],
    },
    proposed_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'LambdaInvokeSpecific',
          Effect: 'Allow',
          Action: ['lambda:InvokeFunction'],
          Resource: `arn:aws:lambda:us-east-1:${ACCOUNT_ID}:function:api-*`,
        },
        {
          Sid: 'CloudWatchLogs',
          Effect: 'Allow',
          Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: `arn:aws:logs:us-east-1:${ACCOUNT_ID}:log-group:/aws/api-gateway/*`,
        },
      ],
    },
    applied_policy: null,
    policy_version: 1,
    policy_history: [],

    intent_summary: 'Allow API Gateway to invoke backend Lambda functions',
    actual_permissions_summary: 'Full Lambda management including delete, publish, and permission changes on all functions',
    intent_gap:
      'API Gateway execution only needs lambda:InvokeFunction on specific functions. The current policy grants full Lambda management — including destructive operations like DeleteFunction — on every function in the account.',
    abuse_scenario:
      'If API Gateway is compromised (e.g. via SSRF), an attacker could delete all Lambda functions, inject malicious code by overwriting function code, or remove Lambda permissions to create a denial of service across the entire application layer.',
    ai_confidence_score: 0.97,
    ai_confidence_note: null,

    simulation_result: 'PASS',
    simulation_actions_removed: [
      'lambda:DeleteFunction',
      'lambda:DeleteAlias',
      'lambda:RemovePermission',
      'lambda:UpdateFunctionCode',
      'lambda:PutFunctionConcurrency',
      'lambda:DeleteFunctionConcurrency',
      'lambda:AddPermission',
    ],
    simulation_actions_preserved: ['lambda:InvokeFunction', 'logs:PutLogEvents'],
    simulation_breaking_changes: [],

    blast_radius: {
      reachable_services: ['lambda', 'logs'],
      critical_paths: ['lambda:DeleteFunction → entire application offline'],
      risk_level: 'MEDIUM',
    },

    terraform_export: `resource "aws_iam_policy" "api_gateway_least_privilege" {
  name        = "api-gateway-execution-least-privilege"
  description = "Least-privilege policy for api-gateway-execution-role (IAM Drift remediation 2026-03-17)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "LambdaInvokeSpecific"
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = "arn:aws:lambda:us-east-1:${ACCOUNT_ID}:function:api-*"
      },
      {
        Sid      = "CloudWatchLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:us-east-1:${ACCOUNT_ID}:log-group:/aws/api-gateway/*"
      }
    ]
  })
}`,

    scan_created_at: SCAN_CREATED,
    last_updated_at: '2026-03-17T08:30:00Z',
    enrichment_completed_at: '2026-03-17T08:28:00Z',
    simulation_completed_at: '2026-03-17T08:29:00Z',
    reviewed_at: null,
    applied_at: null,
    rolled_back_at: null,

    reviewed_by: null,
    review_notes: null,
    alert_sent: false,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 4. cloudwatch-alerts-role — MEDIUM risk
  //    Wildcard on cloudwatch:*; review_decision: REJECTED
  // ══════════════════════════════════════════════════════════════════════════
  {
    scan_id: SCAN_ID,
    role_id: `${BASE_ARN}/cloudwatch-alerts-role`,
    account_id: ACCOUNT_ID,
    role_name: 'cloudwatch-alerts-role',
    role_arn: `${BASE_ARN}/cloudwatch-alerts-role`,

    finding_status: 'READY',
    ai_status: 'COMPLETE',
    simulation_status: 'COMPLETE',
    workflow_state: 'rejected',
    next_action_required: 'reviewer_decision_needed',
    review_decision: 'REJECTED',

    risk_score: 7,
    risk_level: 'MEDIUM',
    wildcard_actions: ['cloudwatch:*'],
    wildcard_resources: ['*'],
    unused_services: ['cloudwatch:DeleteAlarms', 'cloudwatch:DisableAlarmActions'],
    last_used_date: '2026-03-17T05:00:00Z',

    permission_count_before: 15,
    permission_count_after: 5,
    permission_reduction_pct: 66.7,
    services_before: ['cloudwatch', 'sns', 'logs'],
    services_after: ['cloudwatch', 'sns', 'logs'],

    current_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'CloudWatchFullAccess',
          Effect: 'Allow',
          Action: 'cloudwatch:*',
          Resource: '*',
        },
        {
          Sid: 'SNSPublishAlerts',
          Effect: 'Allow',
          Action: ['sns:Publish'],
          Resource: `arn:aws:sns:us-east-1:${ACCOUNT_ID}:ops-alerts`,
        },
        {
          Sid: 'LogsRead',
          Effect: 'Allow',
          Action: ['logs:DescribeLogGroups', 'logs:FilterLogEvents'],
          Resource: '*',
        },
      ],
    },
    proposed_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'CloudWatchAlarmsReadPublish',
          Effect: 'Allow',
          Action: [
            'cloudwatch:PutMetricAlarm',
            'cloudwatch:DescribeAlarms',
            'cloudwatch:GetMetricData',
            'cloudwatch:PutMetricData',
            'cloudwatch:EnableAlarmActions',
          ],
          Resource: '*',
        },
        {
          Sid: 'SNSPublishAlerts',
          Effect: 'Allow',
          Action: ['sns:Publish'],
          Resource: `arn:aws:sns:us-east-1:${ACCOUNT_ID}:ops-alerts`,
        },
        {
          Sid: 'LogsRead',
          Effect: 'Allow',
          Action: ['logs:DescribeLogGroups', 'logs:FilterLogEvents'],
          Resource: `arn:aws:logs:us-east-1:${ACCOUNT_ID}:log-group:/aws/*`,
        },
      ],
    },
    applied_policy: null,
    policy_version: 1,
    policy_history: [],

    intent_summary: 'Publish CloudWatch metrics, manage alarms, and forward alerts via SNS',
    actual_permissions_summary: 'Full CloudWatch management including alarm deletion and disabling on all resources',
    intent_gap:
      'Role needs metric publishing and alarm management but has full CloudWatch including destructive delete and disable actions. The cloudwatch:DeleteAlarms and cloudwatch:DisableAlarmActions permissions have never appeared in CloudTrail.',
    abuse_scenario:
      'An attacker could silence all operational alarms by deleting or disabling them, then proceed with a longer-duration attack undetected. This is a classic pre-attack preparation technique used to blind the security team before a data exfiltration event.',
    ai_confidence_score: 0.89,
    ai_confidence_note: null,

    simulation_result: 'PASS',
    simulation_actions_removed: [
      'cloudwatch:DeleteAlarms',
      'cloudwatch:DisableAlarmActions',
      'cloudwatch:DeleteMetricStream',
      'cloudwatch:DeleteDashboards',
    ],
    simulation_actions_preserved: [
      'cloudwatch:PutMetricAlarm',
      'cloudwatch:DescribeAlarms',
      'cloudwatch:GetMetricData',
      'cloudwatch:PutMetricData',
      'cloudwatch:EnableAlarmActions',
      'sns:Publish',
    ],
    simulation_breaking_changes: [],

    blast_radius: {
      reachable_services: ['cloudwatch', 'sns', 'logs'],
      critical_paths: ['cloudwatch:DeleteAlarms → blind monitoring'],
      risk_level: 'MEDIUM',
    },

    terraform_export: `resource "aws_iam_policy" "cloudwatch_alerts_least_privilege" {
  name        = "cloudwatch-alerts-role-least-privilege"
  description = "Least-privilege policy for cloudwatch-alerts-role (IAM Drift remediation 2026-03-17)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchAlarmsReadPublish"
        Effect = "Allow"
        Action = ["cloudwatch:PutMetricAlarm", "cloudwatch:DescribeAlarms", "cloudwatch:GetMetricData", "cloudwatch:PutMetricData", "cloudwatch:EnableAlarmActions"]
        Resource = "*"
      },
      {
        Sid      = "SNSPublishAlerts"
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = "arn:aws:sns:us-east-1:${ACCOUNT_ID}:ops-alerts"
      }
    ]
  })
}`,

    scan_created_at: SCAN_CREATED,
    last_updated_at: '2026-03-17T11:00:00Z',
    enrichment_completed_at: '2026-03-17T08:32:00Z',
    simulation_completed_at: '2026-03-17T08:34:00Z',
    reviewed_at: '2026-03-17T11:00:00Z',
    applied_at: null,
    rolled_back_at: null,

    reviewed_by: 'marcus.wright@techcorp.io',
    review_notes:
      'Rejected — proposal removes cloudwatch:DeleteAlarms which is used by our automated chaos engineering runbooks. Need revised policy that preserves this for the chaos-runner IAM role only. Will re-evaluate after runbook is updated.',
    alert_sent: false,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 5. ecs-task-execution-role — LOW risk
  //    No wildcards; ecr:DeleteRepository never used
  // ══════════════════════════════════════════════════════════════════════════
  {
    scan_id: SCAN_ID,
    role_id: `${BASE_ARN}/ecs-task-execution-role`,
    account_id: ACCOUNT_ID,
    role_name: 'ecs-task-execution-role',
    role_arn: `${BASE_ARN}/ecs-task-execution-role`,

    finding_status: 'READY',
    ai_status: 'COMPLETE',
    simulation_status: 'COMPLETE',
    workflow_state: 'ready_for_review',
    next_action_required: 'reviewer_decision_needed',
    review_decision: 'PENDING',

    risk_score: 3,
    risk_level: 'LOW',
    wildcard_actions: [],
    wildcard_resources: [],
    unused_services: ['ecr:DeleteRepository', 'ecr:BatchDeleteImage'],
    last_used_date: '2026-03-17T07:00:00Z',

    permission_count_before: 8,
    permission_count_after: 6,
    permission_reduction_pct: 25.0,
    services_before: ['ecr', 'logs', 'ssm'],
    services_after: ['ecr', 'logs', 'ssm'],

    current_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'ECRAccess',
          Effect: 'Allow',
          Action: [
            'ecr:GetAuthorizationToken',
            'ecr:BatchCheckLayerAvailability',
            'ecr:GetDownloadUrlForLayer',
            'ecr:BatchGetImage',
            'ecr:DeleteRepository',
            'ecr:BatchDeleteImage',
          ],
          Resource: '*',
        },
        {
          Sid: 'CloudWatchLogs',
          Effect: 'Allow',
          Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: `arn:aws:logs:us-east-1:${ACCOUNT_ID}:log-group:/ecs/*`,
        },
      ],
    },
    proposed_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'ECRPullOnly',
          Effect: 'Allow',
          Action: [
            'ecr:GetAuthorizationToken',
            'ecr:BatchCheckLayerAvailability',
            'ecr:GetDownloadUrlForLayer',
            'ecr:BatchGetImage',
          ],
          Resource: '*',
        },
        {
          Sid: 'CloudWatchLogs',
          Effect: 'Allow',
          Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: `arn:aws:logs:us-east-1:${ACCOUNT_ID}:log-group:/ecs/*`,
        },
      ],
    },
    applied_policy: null,
    policy_version: 1,
    policy_history: [],

    intent_summary: 'Pull container images from ECR and stream task logs to CloudWatch',
    actual_permissions_summary: 'ECR pull access plus DeleteRepository and BatchDeleteImage on all repositories',
    intent_gap:
      'ECS task execution only requires image pull operations. The delete permissions (ecr:DeleteRepository and ecr:BatchDeleteImage) have never been used and are not appropriate for runtime task execution.',
    abuse_scenario:
      'A compromised container could permanently destroy ECR repositories containing all production container images, causing a catastrophic deployment outage. Recovery would require rebuilding and re-pushing all images.',
    ai_confidence_score: 0.99,
    ai_confidence_note: null,

    simulation_result: 'PASS',
    simulation_actions_removed: ['ecr:DeleteRepository', 'ecr:BatchDeleteImage'],
    simulation_actions_preserved: [
      'ecr:GetAuthorizationToken',
      'ecr:BatchCheckLayerAvailability',
      'ecr:GetDownloadUrlForLayer',
      'ecr:BatchGetImage',
      'logs:CreateLogStream',
      'logs:PutLogEvents',
    ],
    simulation_breaking_changes: [],

    blast_radius: {
      reachable_services: ['ecr', 'logs'],
      critical_paths: ['ecr:DeleteRepository → all container images lost'],
      risk_level: 'LOW',
    },

    terraform_export: `resource "aws_iam_policy" "ecs_task_execution_least_privilege" {
  name        = "ecs-task-execution-least-privilege"
  description = "Least-privilege policy for ecs-task-execution-role (IAM Drift remediation 2026-03-17)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ECRPullOnly"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken", "ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"]
        Resource = "*"
      },
      {
        Sid      = "CloudWatchLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:us-east-1:${ACCOUNT_ID}:log-group:/ecs/*"
      }
    ]
  })
}`,

    scan_created_at: SCAN_CREATED,
    last_updated_at: '2026-03-17T08:40:00Z',
    enrichment_completed_at: '2026-03-17T08:38:00Z',
    simulation_completed_at: '2026-03-17T08:39:00Z',
    reviewed_at: null,
    applied_at: null,
    rolled_back_at: null,

    reviewed_by: null,
    review_notes: null,
    alert_sent: false,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 6. deployment-pipeline-role — HIGH risk
  //    Wildcards on iam:* + ec2:*; iam:DeleteRole never used
  // ══════════════════════════════════════════════════════════════════════════
  {
    scan_id: SCAN_ID,
    role_id: `${BASE_ARN}/deployment-pipeline-role`,
    account_id: ACCOUNT_ID,
    role_name: 'deployment-pipeline-role',
    role_arn: `${BASE_ARN}/deployment-pipeline-role`,

    finding_status: 'READY',
    ai_status: 'COMPLETE',
    simulation_status: 'COMPLETE',
    workflow_state: 'ready_for_review',
    next_action_required: 'reviewer_decision_needed',
    review_decision: 'PENDING',

    risk_score: 18,
    risk_level: 'HIGH',
    wildcard_actions: ['iam:*', 'ec2:*'],
    wildcard_resources: ['*'],
    unused_services: ['iam:DeleteRole', 'iam:DeletePolicy', 'iam:AttachRolePolicy'],
    last_used_date: '2026-03-17T04:00:00Z',

    permission_count_before: 28,
    permission_count_after: 12,
    permission_reduction_pct: 57.1,
    services_before: ['iam', 'ec2', 'ecr', 'ecs', 'cloudformation', 'ssm'],
    services_after: ['ec2', 'ecr', 'ecs', 'cloudformation', 'ssm'],

    current_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'IAMFullAccess',
          Effect: 'Allow',
          Action: 'iam:*',
          Resource: '*',
        },
        {
          Sid: 'EC2FullAccess',
          Effect: 'Allow',
          Action: 'ec2:*',
          Resource: '*',
        },
        {
          Sid: 'ECSDeployment',
          Effect: 'Allow',
          Action: [
            'ecs:CreateService',
            'ecs:UpdateService',
            'ecs:DescribeServices',
            'ecs:RegisterTaskDefinition',
            'ecs:DeregisterTaskDefinition',
          ],
          Resource: '*',
        },
        {
          Sid: 'ECRPush',
          Effect: 'Allow',
          Action: [
            'ecr:GetAuthorizationToken',
            'ecr:BatchCheckLayerAvailability',
            'ecr:PutImage',
            'ecr:InitiateLayerUpload',
            'ecr:UploadLayerPart',
            'ecr:CompleteLayerUpload',
          ],
          Resource: '*',
        },
        {
          Sid: 'CloudFormationDeploy',
          Effect: 'Allow',
          Action: [
            'cloudformation:CreateStack',
            'cloudformation:UpdateStack',
            'cloudformation:DescribeStacks',
            'cloudformation:DescribeStackEvents',
          ],
          Resource: `arn:aws:cloudformation:us-east-1:${ACCOUNT_ID}:stack/techcorp-*`,
        },
      ],
    },
    proposed_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'IAMPassRoleForECS',
          Effect: 'Allow',
          Action: ['iam:PassRole', 'iam:GetRole'],
          Resource: `arn:aws:iam::${ACCOUNT_ID}:role/ecs-*`,
        },
        {
          Sid: 'EC2ForDeployment',
          Effect: 'Allow',
          Action: [
            'ec2:DescribeInstances',
            'ec2:DescribeSecurityGroups',
            'ec2:DescribeSubnets',
            'ec2:DescribeVpcs',
            'ec2:DescribeTargetGroups',
          ],
          Resource: '*',
        },
        {
          Sid: 'ECSDeployment',
          Effect: 'Allow',
          Action: [
            'ecs:CreateService',
            'ecs:UpdateService',
            'ecs:DescribeServices',
            'ecs:RegisterTaskDefinition',
            'ecs:DeregisterTaskDefinition',
          ],
          Resource: '*',
        },
        {
          Sid: 'ECRPush',
          Effect: 'Allow',
          Action: [
            'ecr:GetAuthorizationToken',
            'ecr:BatchCheckLayerAvailability',
            'ecr:PutImage',
            'ecr:InitiateLayerUpload',
            'ecr:UploadLayerPart',
            'ecr:CompleteLayerUpload',
          ],
          Resource: `arn:aws:ecr:us-east-1:${ACCOUNT_ID}:repository/techcorp-*`,
        },
        {
          Sid: 'CloudFormationDeploy',
          Effect: 'Allow',
          Action: [
            'cloudformation:CreateStack',
            'cloudformation:UpdateStack',
            'cloudformation:DescribeStacks',
            'cloudformation:DescribeStackEvents',
          ],
          Resource: `arn:aws:cloudformation:us-east-1:${ACCOUNT_ID}:stack/techcorp-*`,
        },
      ],
    },
    applied_policy: null,
    policy_version: 1,
    policy_history: [],

    intent_summary: 'CI/CD pipeline deploying ECS services with CloudFormation and pushing images to ECR',
    actual_permissions_summary: 'Full IAM management + full EC2 control on all resources account-wide',
    intent_gap:
      'Deployment pipeline requires iam:PassRole for ECS tasks but has full IAM management including the ability to create, delete, and attach arbitrary policies. EC2 full access is used only for describe operations during deployment health checks. This is a textbook privilege escalation vector.',
    abuse_scenario:
      'A compromised CI/CD pipeline could create a new IAM admin role, attach AdministratorAccess, and assume it — achieving full account takeover in seconds. This is the most dangerous configuration pattern in the account. Full IAM + full EC2 is a direct path to account root equivalent.',
    ai_confidence_score: 0.96,
    ai_confidence_note: null,

    simulation_result: 'PASS',
    simulation_actions_removed: [
      'iam:DeleteRole',
      'iam:DeletePolicy',
      'iam:AttachRolePolicy',
      'iam:CreatePolicy',
      'iam:CreateRole',
      'ec2:TerminateInstances',
      'ec2:RunInstances',
      'ec2:StopInstances',
    ],
    simulation_actions_preserved: [
      'iam:PassRole',
      'iam:GetRole',
      'ec2:DescribeInstances',
      'ec2:DescribeSecurityGroups',
      'ec2:DescribeSubnets',
      'ecs:UpdateService',
      'ecr:PutImage',
      'cloudformation:UpdateStack',
    ],
    simulation_breaking_changes: [],

    blast_radius: {
      reachable_services: ['iam', 'ec2', 'ecs', 'ecr', 'cloudformation', 'ssm'],
      critical_paths: [
        'iam:CreateRole + iam:AttachRolePolicy → privilege escalation to admin',
        'ec2:TerminateInstances → production fleet destruction',
      ],
      risk_level: 'HIGH',
    },

    terraform_export: `resource "aws_iam_policy" "deployment_pipeline_least_privilege" {
  name        = "deployment-pipeline-least-privilege"
  description = "Least-privilege policy for deployment-pipeline-role (IAM Drift remediation 2026-03-17)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "IAMPassRoleForECS"
        Effect   = "Allow"
        Action   = ["iam:PassRole", "iam:GetRole"]
        Resource = "arn:aws:iam::${ACCOUNT_ID}:role/ecs-*"
      },
      {
        Sid    = "EC2ForDeployment"
        Effect = "Allow"
        Action = ["ec2:DescribeInstances", "ec2:DescribeSecurityGroups", "ec2:DescribeSubnets", "ec2:DescribeVpcs"]
        Resource = "*"
      },
      {
        Sid    = "ECSDeployment"
        Effect = "Allow"
        Action = ["ecs:CreateService", "ecs:UpdateService", "ecs:DescribeServices", "ecs:RegisterTaskDefinition"]
        Resource = "*"
      }
    ]
  })
}`,

    scan_created_at: SCAN_CREATED,
    last_updated_at: '2026-03-17T08:48:00Z',
    enrichment_completed_at: '2026-03-17T08:44:00Z',
    simulation_completed_at: '2026-03-17T08:46:00Z',
    reviewed_at: null,
    applied_at: null,
    rolled_back_at: null,

    reviewed_by: null,
    review_notes: null,
    alert_sent: true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 7. backup-service-role — MEDIUM risk
  //    Wildcard on s3:*; s3:DeleteBucket never used; APPROVED → applied
  // ══════════════════════════════════════════════════════════════════════════
  {
    scan_id: SCAN_ID,
    role_id: `${BASE_ARN}/backup-service-role`,
    account_id: ACCOUNT_ID,
    role_name: 'backup-service-role',
    role_arn: `${BASE_ARN}/backup-service-role`,

    finding_status: 'READY',
    ai_status: 'COMPLETE',
    simulation_status: 'COMPLETE',
    workflow_state: 'applied',
    next_action_required: 'rollback_available',
    review_decision: 'APPROVED',

    risk_score: 8,
    risk_level: 'MEDIUM',
    wildcard_actions: ['s3:*'],
    wildcard_resources: ['*'],
    unused_services: ['s3:DeleteBucket', 's3:PutBucketPolicy', 's3:DeleteBucketPolicy'],
    last_used_date: '2026-03-17T02:00:00Z',

    permission_count_before: 10,
    permission_count_after: 4,
    permission_reduction_pct: 60.0,
    services_before: ['s3', 'kms', 'logs'],
    services_after: ['s3', 'kms', 'logs'],

    current_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'S3FullAccess',
          Effect: 'Allow',
          Action: 's3:*',
          Resource: '*',
        },
        {
          Sid: 'KMSEncryption',
          Effect: 'Allow',
          Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
          Resource: `arn:aws:kms:us-east-1:${ACCOUNT_ID}:key/*`,
        },
      ],
    },
    proposed_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'S3BackupCopyAccess',
          Effect: 'Allow',
          Action: [
            's3:GetObject',
            's3:PutObject',
            's3:ListBucket',
            's3:GetObjectVersion',
          ],
          Resource: [
            `arn:aws:s3:::techcorp-*-backup`,
            `arn:aws:s3:::techcorp-*-backup/*`,
          ],
        },
        {
          Sid: 'KMSEncryption',
          Effect: 'Allow',
          Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
          Resource: `arn:aws:kms:us-east-1:${ACCOUNT_ID}:key/*`,
        },
      ],
    },
    applied_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'S3BackupCopyAccess',
          Effect: 'Allow',
          Action: [
            's3:GetObject',
            's3:PutObject',
            's3:ListBucket',
            's3:GetObjectVersion',
          ],
          Resource: [
            `arn:aws:s3:::techcorp-*-backup`,
            `arn:aws:s3:::techcorp-*-backup/*`,
          ],
        },
        {
          Sid: 'KMSEncryption',
          Effect: 'Allow',
          Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
          Resource: `arn:aws:kms:us-east-1:${ACCOUNT_ID}:key/*`,
        },
      ],
    },
    policy_version: 2,
    policy_history: [
      {
        version: 1,
        policy: {
          Version: '2012-10-17',
          Statement: [
            { Sid: 'S3FullAccess', Effect: 'Allow', Action: 's3:*', Resource: '*' },
            {
              Sid: 'KMSEncryption',
              Effect: 'Allow',
              Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
              Resource: `arn:aws:kms:us-east-1:${ACCOUNT_ID}:key/*`,
            },
          ],
        },
        changed_at: '2026-03-17T09:30:00Z',
        changed_by: 'iam-drift-intelligence',
        change_reason: 'Remediation: replaced s3:* wildcard with scoped backup bucket ARNs',
      },
    ],

    intent_summary: 'Copy production S3 objects to backup buckets with KMS encryption',
    actual_permissions_summary: 'Full S3 access on all buckets including delete and policy management',
    intent_gap:
      'Backup service only needs to copy objects between specific buckets. The s3:DeleteBucket and s3:PutBucketPolicy permissions have never been used and could allow the backup role to inadvertently or maliciously destroy backup infrastructure.',
    abuse_scenario:
      'A misconfigured backup job or compromised credentials could delete all backup buckets, leaving the company with no recovery point in the event of a ransomware attack. The backup role should never have the ability to destroy what it is trying to protect.',
    ai_confidence_score: 0.93,
    ai_confidence_note: null,

    simulation_result: 'PASS',
    simulation_actions_removed: [
      's3:DeleteBucket',
      's3:PutBucketPolicy',
      's3:DeleteBucketPolicy',
      's3:PutBucketVersioning',
      's3:DeleteObject',
    ],
    simulation_actions_preserved: [
      's3:GetObject',
      's3:PutObject',
      's3:ListBucket',
      's3:GetObjectVersion',
      'kms:GenerateDataKey',
      'kms:Decrypt',
    ],
    simulation_breaking_changes: [],

    blast_radius: {
      reachable_services: ['s3', 'kms'],
      critical_paths: ['s3:DeleteBucket → backup destruction', 's3:* → all company data'],
      risk_level: 'MEDIUM',
    },

    terraform_export: `resource "aws_iam_policy" "backup_service_least_privilege" {
  name        = "backup-service-least-privilege"
  description = "Least-privilege policy for backup-service-role (IAM Drift remediation 2026-03-17)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3BackupCopyAccess"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:GetObjectVersion"]
        Resource = ["arn:aws:s3:::techcorp-*-backup", "arn:aws:s3:::techcorp-*-backup/*"]
      },
      {
        Sid      = "KMSEncryption"
        Effect   = "Allow"
        Action   = ["kms:GenerateDataKey", "kms:Decrypt"]
        Resource = "arn:aws:kms:us-east-1:${ACCOUNT_ID}:key/*"
      }
    ]
  })
}`,

    scan_created_at: SCAN_CREATED,
    last_updated_at: '2026-03-17T09:35:00Z',
    enrichment_completed_at: '2026-03-17T08:50:00Z',
    simulation_completed_at: '2026-03-17T08:52:00Z',
    reviewed_at: '2026-03-17T09:30:00Z',
    applied_at: '2026-03-17T09:35:00Z',
    rolled_back_at: null,

    reviewed_by: 'sarah.chen@techcorp.io',
    review_notes: 'Approved — confirmed with infra team. Backup role should never have delete permissions on the buckets it writes to.',
    alert_sent: false,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 8. read-only-audit-role — LOW risk
  //    No wildcards, no unused services; near-clean role
  // ══════════════════════════════════════════════════════════════════════════
  {
    scan_id: SCAN_ID,
    role_id: `${BASE_ARN}/read-only-audit-role`,
    account_id: ACCOUNT_ID,
    role_name: 'read-only-audit-role',
    role_arn: `${BASE_ARN}/read-only-audit-role`,

    finding_status: 'READY',
    ai_status: 'COMPLETE',
    simulation_status: 'COMPLETE',
    workflow_state: 'approved',
    next_action_required: 'safe_to_apply',
    review_decision: 'APPROVED',

    risk_score: 2,
    risk_level: 'LOW',
    wildcard_actions: [],
    wildcard_resources: [],
    unused_services: [],
    last_used_date: '2026-03-16T23:00:00Z',

    permission_count_before: 15,
    permission_count_after: 14,
    permission_reduction_pct: 6.7,
    services_before: ['s3', 'ec2', 'iam', 'cloudwatch', 'logs', 'cloudtrail'],
    services_after: ['s3', 'ec2', 'iam', 'cloudwatch', 'logs', 'cloudtrail'],

    current_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AuditReadAccess',
          Effect: 'Allow',
          Action: [
            's3:GetObject',
            's3:ListBucket',
            'ec2:DescribeInstances',
            'ec2:DescribeSecurityGroups',
            'ec2:DescribeVpcs',
            'iam:GetRole',
            'iam:ListRoles',
            'iam:GetPolicy',
            'iam:ListPolicies',
            'iam:ListAttachedRolePolicies',
            'cloudwatch:DescribeAlarms',
            'cloudwatch:GetMetricData',
            'logs:FilterLogEvents',
            'logs:DescribeLogGroups',
            'cloudtrail:LookupEvents',
            'cloudtrail:GetTrailStatus',
          ],
          Resource: '*',
        },
      ],
    },
    proposed_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AuditReadAccess',
          Effect: 'Allow',
          Action: [
            's3:GetObject',
            's3:ListBucket',
            'ec2:DescribeInstances',
            'ec2:DescribeSecurityGroups',
            'ec2:DescribeVpcs',
            'iam:GetRole',
            'iam:ListRoles',
            'iam:GetPolicy',
            'iam:ListPolicies',
            'iam:ListAttachedRolePolicies',
            'cloudwatch:DescribeAlarms',
            'cloudwatch:GetMetricData',
            'logs:FilterLogEvents',
            'logs:DescribeLogGroups',
            'cloudtrail:LookupEvents',
          ],
          Resource: '*',
        },
      ],
    },
    applied_policy: null,
    policy_version: 1,
    policy_history: [],

    intent_summary: 'Read-only access to audit AWS resource configurations, IAM posture, and CloudTrail activity',
    actual_permissions_summary:
      'Broad read-only access across compute, storage, IAM, monitoring, and audit services',
    intent_gap:
      'Role is well-scoped for its audit purpose. Minor improvement: cloudtrail:GetTrailStatus has not appeared in recent CloudTrail logs (meta-irony). Minimal risk impact — included for completeness.',
    abuse_scenario:
      'Read-only access limits blast radius significantly. An attacker with this role could perform reconnaissance across the account — mapping IAM roles, EC2 infrastructure, and S3 buckets — to plan a privilege escalation attack via a higher-privilege role or credential theft.',
    ai_confidence_score: 0.99,
    ai_confidence_note:
      'Very high confidence — role intent and permissions are closely aligned. Single unused action identified.',

    simulation_result: 'PASS',
    simulation_actions_removed: ['cloudtrail:GetTrailStatus'],
    simulation_actions_preserved: [
      's3:GetObject',
      's3:ListBucket',
      'ec2:DescribeInstances',
      'iam:GetRole',
      'iam:ListRoles',
      'cloudwatch:DescribeAlarms',
      'logs:FilterLogEvents',
      'cloudtrail:LookupEvents',
    ],
    simulation_breaking_changes: [],

    blast_radius: {
      reachable_services: ['s3', 'ec2', 'iam', 'cloudwatch', 'logs', 'cloudtrail'],
      critical_paths: [],
      risk_level: 'LOW',
    },

    terraform_export: `resource "aws_iam_policy" "read_only_audit_least_privilege" {
  name        = "read-only-audit-least-privilege"
  description = "Least-privilege policy for read-only-audit-role (IAM Drift remediation 2026-03-17)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AuditReadAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject", "s3:ListBucket", "ec2:DescribeInstances", "ec2:DescribeSecurityGroups",
          "iam:GetRole", "iam:ListRoles", "iam:GetPolicy", "iam:ListPolicies",
          "cloudwatch:DescribeAlarms", "cloudwatch:GetMetricData",
          "logs:FilterLogEvents", "logs:DescribeLogGroups", "cloudtrail:LookupEvents"
        ]
        Resource = "*"
      }
    ]
  })
}`,

    scan_created_at: SCAN_CREATED,
    last_updated_at: '2026-03-17T09:00:00Z',
    enrichment_completed_at: '2026-03-17T08:56:00Z',
    simulation_completed_at: '2026-03-17T08:58:00Z',
    reviewed_at: '2026-03-17T09:00:00Z',
    applied_at: null,
    rolled_back_at: null,

    reviewed_by: 'marcus.wright@techcorp.io',
    review_notes: 'Approved — trivial cleanup, safe to apply at any time.',
    alert_sent: false,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 9. ml-training-role — MEDIUM risk
  //    Wildcards on s3:* + sagemaker:*; sagemaker:DeleteModel never used
  // ══════════════════════════════════════════════════════════════════════════
  {
    scan_id: SCAN_ID,
    role_id: `${BASE_ARN}/ml-training-role`,
    account_id: ACCOUNT_ID,
    role_name: 'ml-training-role',
    role_arn: `${BASE_ARN}/ml-training-role`,

    finding_status: 'READY',
    ai_status: 'COMPLETE',
    simulation_status: 'COMPLETE',
    workflow_state: 'ready_for_review',
    next_action_required: 'reviewer_decision_needed',
    review_decision: 'PENDING',

    risk_score: 10,
    risk_level: 'MEDIUM',
    wildcard_actions: ['s3:*', 'sagemaker:*'],
    wildcard_resources: ['*'],
    unused_services: ['sagemaker:DeleteModel', 'sagemaker:DeleteEndpoint', 'sagemaker:StopTrainingJob'],
    last_used_date: '2026-03-15T18:00:00Z',

    permission_count_before: 20,
    permission_count_after: 10,
    permission_reduction_pct: 50.0,
    services_before: ['s3', 'sagemaker', 'ecr', 'logs', 'kms'],
    services_after: ['s3', 'sagemaker', 'ecr', 'logs', 'kms'],

    current_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'S3FullAccess',
          Effect: 'Allow',
          Action: 's3:*',
          Resource: '*',
        },
        {
          Sid: 'SageMakerFullAccess',
          Effect: 'Allow',
          Action: 'sagemaker:*',
          Resource: '*',
        },
        {
          Sid: 'ECRRead',
          Effect: 'Allow',
          Action: [
            'ecr:GetAuthorizationToken',
            'ecr:BatchCheckLayerAvailability',
            'ecr:GetDownloadUrlForLayer',
            'ecr:BatchGetImage',
          ],
          Resource: '*',
        },
        {
          Sid: 'KMSDecrypt',
          Effect: 'Allow',
          Action: ['kms:GenerateDataKey', 'kms:Decrypt', 'kms:DescribeKey'],
          Resource: '*',
        },
        {
          Sid: 'CloudWatchLogs',
          Effect: 'Allow',
          Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: '*',
        },
      ],
    },
    proposed_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'S3MLDatasets',
          Effect: 'Allow',
          Action: ['s3:GetObject', 's3:PutObject', 's3:ListBucket'],
          Resource: [
            `arn:aws:s3:::techcorp-ml-datasets`,
            `arn:aws:s3:::techcorp-ml-datasets/*`,
            `arn:aws:s3:::techcorp-ml-models`,
            `arn:aws:s3:::techcorp-ml-models/*`,
          ],
        },
        {
          Sid: 'SageMakerTrainingOnly',
          Effect: 'Allow',
          Action: [
            'sagemaker:CreateTrainingJob',
            'sagemaker:DescribeTrainingJob',
            'sagemaker:CreateModel',
            'sagemaker:DescribeModel',
            'sagemaker:CreateEndpointConfig',
            'sagemaker:CreateEndpoint',
            'sagemaker:DescribeEndpoint',
          ],
          Resource: `arn:aws:sagemaker:us-east-1:${ACCOUNT_ID}:*`,
        },
        {
          Sid: 'ECRRead',
          Effect: 'Allow',
          Action: [
            'ecr:GetAuthorizationToken',
            'ecr:BatchCheckLayerAvailability',
            'ecr:GetDownloadUrlForLayer',
            'ecr:BatchGetImage',
          ],
          Resource: '*',
        },
        {
          Sid: 'KMSDecrypt',
          Effect: 'Allow',
          Action: ['kms:GenerateDataKey', 'kms:Decrypt', 'kms:DescribeKey'],
          Resource: `arn:aws:kms:us-east-1:${ACCOUNT_ID}:key/*`,
        },
        {
          Sid: 'CloudWatchLogs',
          Effect: 'Allow',
          Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: `arn:aws:logs:us-east-1:${ACCOUNT_ID}:log-group:/aws/sagemaker/*`,
        },
      ],
    },
    applied_policy: null,
    policy_version: 1,
    policy_history: [],

    intent_summary: 'Train ML models on SageMaker using datasets stored in S3',
    actual_permissions_summary: 'Full S3 and full SageMaker on all resources, broad KMS access',
    intent_gap:
      'ML training needs access to specific S3 dataset buckets and SageMaker training/inference actions. The sagemaker:* wildcard includes destructive operations (DeleteModel, DeleteEndpoint, StopTrainingJob) that could disrupt production ML endpoints. S3 wildcard exposes all company data.',
    abuse_scenario:
      'A compromised training job could exfiltrate all company data from S3 to an external endpoint, delete production ML model versions, or trigger expensive training jobs to cause resource exhaustion and cost spikes.',
    ai_confidence_score: 0.88,
    ai_confidence_note:
      'Moderate-high confidence. SageMaker permission scope depends on whether cross-training-job access is intentional. Flagged for reviewer validation.',

    simulation_result: 'PASS',
    simulation_actions_removed: [
      'sagemaker:DeleteModel',
      'sagemaker:DeleteEndpoint',
      'sagemaker:StopTrainingJob',
      's3:DeleteBucket',
      's3:PutBucketPolicy',
    ],
    simulation_actions_preserved: [
      'sagemaker:CreateTrainingJob',
      'sagemaker:DescribeTrainingJob',
      'sagemaker:CreateModel',
      's3:GetObject',
      's3:PutObject',
      's3:ListBucket',
      'ecr:BatchGetImage',
      'kms:Decrypt',
    ],
    simulation_breaking_changes: [],

    blast_radius: {
      reachable_services: ['s3', 'sagemaker', 'ecr', 'kms', 'logs'],
      critical_paths: [
        'sagemaker:* → delete production ML endpoints',
        's3:* → access all datasets including PII',
      ],
      risk_level: 'MEDIUM',
    },

    terraform_export: `resource "aws_iam_policy" "ml_training_least_privilege" {
  name        = "ml-training-role-least-privilege"
  description = "Least-privilege policy for ml-training-role (IAM Drift remediation 2026-03-17)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3MLDatasets"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
        Resource = ["arn:aws:s3:::techcorp-ml-datasets", "arn:aws:s3:::techcorp-ml-datasets/*", "arn:aws:s3:::techcorp-ml-models", "arn:aws:s3:::techcorp-ml-models/*"]
      },
      {
        Sid      = "SageMakerTrainingOnly"
        Effect   = "Allow"
        Action   = ["sagemaker:CreateTrainingJob", "sagemaker:DescribeTrainingJob", "sagemaker:CreateModel", "sagemaker:DescribeModel"]
        Resource = "arn:aws:sagemaker:us-east-1:${ACCOUNT_ID}:*"
      }
    ]
  })
}`,

    scan_created_at: SCAN_CREATED,
    last_updated_at: '2026-03-17T09:05:00Z',
    enrichment_completed_at: '2026-03-17T09:00:00Z',
    simulation_completed_at: '2026-03-17T09:02:00Z',
    reviewed_at: null,
    applied_at: null,
    rolled_back_at: null,

    reviewed_by: null,
    review_notes: null,
    alert_sent: false,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 10. legacy-admin-role — HIGH (CRITICAL risk_score)
  //     Wildcard *:* on *; multiple unused services; highest-risk role
  // ══════════════════════════════════════════════════════════════════════════
  {
    scan_id: SCAN_ID,
    role_id: `${BASE_ARN}/legacy-admin-role`,
    account_id: ACCOUNT_ID,
    role_name: 'legacy-admin-role',
    role_arn: `${BASE_ARN}/legacy-admin-role`,

    finding_status: 'READY',
    ai_status: 'COMPLETE',
    simulation_status: 'COMPLETE',
    workflow_state: 'ready_for_review',
    next_action_required: 'reviewer_decision_needed',
    review_decision: 'PENDING',

    risk_score: 25,
    risk_level: 'HIGH',
    wildcard_actions: ['*'],
    wildcard_resources: ['*'],
    unused_services: ['ec2', 'rds', 'iam', 'cognito', 'route53', 'acm', 'secretsmanager'],
    last_used_date: '2025-11-15T00:00:00Z',

    permission_count_before: 50,
    permission_count_after: 8,
    permission_reduction_pct: 84.0,
    services_before: [
      's3', 'ec2', 'rds', 'iam', 'cognito', 'route53', 'acm',
      'secretsmanager', 'lambda', 'dynamodb', 'cloudwatch', 'logs',
    ],
    services_after: ['s3', 'lambda', 'dynamodb', 'cloudwatch', 'logs'],

    current_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AdministratorAccess',
          Effect: 'Allow',
          Action: '*',
          Resource: '*',
        },
      ],
    },
    proposed_policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'S3LegacyBucketAccess',
          Effect: 'Allow',
          Action: ['s3:GetObject', 's3:PutObject', 's3:ListBucket'],
          Resource: [
            `arn:aws:s3:::techcorp-legacy-archive`,
            `arn:aws:s3:::techcorp-legacy-archive/*`,
          ],
        },
        {
          Sid: 'LambdaInvoke',
          Effect: 'Allow',
          Action: ['lambda:InvokeFunction'],
          Resource: `arn:aws:lambda:us-east-1:${ACCOUNT_ID}:function:legacy-*`,
        },
        {
          Sid: 'DynamoDBLegacyTables',
          Effect: 'Allow',
          Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:UpdateItem'],
          Resource: `arn:aws:dynamodb:us-east-1:${ACCOUNT_ID}:table/legacy-*`,
        },
        {
          Sid: 'CloudWatchReadOnly',
          Effect: 'Allow',
          Action: ['cloudwatch:GetMetricData', 'cloudwatch:DescribeAlarms'],
          Resource: '*',
        },
        {
          Sid: 'LogsReadOnly',
          Effect: 'Allow',
          Action: ['logs:FilterLogEvents', 'logs:DescribeLogGroups'],
          Resource: `arn:aws:logs:us-east-1:${ACCOUNT_ID}:log-group:/aws/lambda/legacy-*`,
        },
      ],
    },
    applied_policy: null,
    policy_version: 1,
    policy_history: [],

    intent_summary: 'Legacy administrative role created in 2022 with no clear documented ownership — suspected to support a legacy integration that may no longer be active',
    actual_permissions_summary:
      'AdministratorAccess policy (*:* on *) — equivalent to root access',
    intent_gap:
      'This role has full AdministratorAccess and has not been used since November 2025. CloudTrail shows the last activity was s3:GetObject and lambda:InvokeFunction on legacy resources. There is no documented owner or business justification for this level of access. The proposed policy is based solely on observed CloudTrail activity — ownership verification is required before applying.',
    abuse_scenario:
      'This is the single most dangerous role in the account. An attacker gaining access to this role has full account takeover capability — equivalent to AWS root access. They could create backdoor IAM users, delete all resources, exfiltrate the entire data estate, or permanently destroy the account. The 4-month dormancy period suggests this role may be an orphaned credential that has already been forgotten by the security team.',
    ai_confidence_score: 0.61,
    ai_confidence_note:
      'Low-moderate confidence. Proposed policy derived entirely from CloudTrail activity — intent cannot be reliably inferred for a legacy-admin role. Requires human review and ownership verification before any remediation. Consider deactivating the role entirely pending investigation.',

    simulation_result: 'PARTIAL',
    simulation_actions_removed: [
      'ec2:*',
      'rds:*',
      'iam:*',
      'cognito-idp:*',
      'route53:*',
      'acm:*',
      'secretsmanager:*',
    ],
    simulation_actions_preserved: [
      's3:GetObject',
      's3:PutObject',
      'lambda:InvokeFunction',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'cloudwatch:GetMetricData',
      'logs:FilterLogEvents',
    ],
    simulation_breaking_changes: [
      'secretsmanager:GetSecretValue — legacy integration may read secrets at startup; verify before removing',
    ],

    blast_radius: {
      reachable_services: [
        's3', 'ec2', 'rds', 'iam', 'cognito', 'route53',
        'acm', 'secretsmanager', 'lambda', 'dynamodb',
      ],
      critical_paths: [
        'iam:* → full privilege escalation',
        'ec2:* + rds:* → full compute and database control',
        'route53:* → DNS hijacking for all company domains',
        'secretsmanager:* → all application secrets exposed',
      ],
      risk_level: 'HIGH',
    },

    terraform_export: `# WARNING: legacy-admin-role has AdministratorAccess (*:*)
# This Terraform exports the PROPOSED least-privilege policy only.
# Requires ownership verification and security team approval before applying.

resource "aws_iam_policy" "legacy_admin_least_privilege" {
  name        = "legacy-admin-role-least-privilege"
  description = "Proposed least-privilege policy for legacy-admin-role (IAM Drift remediation 2026-03-17) — REQUIRES OWNERSHIP VERIFICATION"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3LegacyBucketAccess"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
        Resource = ["arn:aws:s3:::techcorp-legacy-archive", "arn:aws:s3:::techcorp-legacy-archive/*"]
      },
      {
        Sid      = "LambdaInvoke"
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = "arn:aws:lambda:us-east-1:${ACCOUNT_ID}:function:legacy-*"
      },
      {
        Sid      = "DynamoDBLegacyTables"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:UpdateItem"]
        Resource = "arn:aws:dynamodb:us-east-1:${ACCOUNT_ID}:table/legacy-*"
      }
    ]
  })
}`,

    scan_created_at: SCAN_CREATED,
    last_updated_at: '2026-03-17T09:12:00Z',
    enrichment_completed_at: '2026-03-17T09:08:00Z',
    simulation_completed_at: '2026-03-17T09:10:00Z',
    reviewed_at: null,
    applied_at: null,
    rolled_back_at: null,

    reviewed_by: null,
    review_notes: null,
    alert_sent: true,
  },
];

// ─── Seed Scan ────────────────────────────────────────────────────────────────

export const seedScan: IamScan = {
  scan_id: SCAN_ID,
  account_id: ACCOUNT_ID,
  account_name: ACCOUNT_NAME,
  scan_status: 'COMPLETE',
  total_roles_scanned: 10,
  high_risk_count: 4,
  medium_risk_count: 4,
  low_risk_count: 2,
  health_score: 54,
  triggered_by: 'SCHEDULED',
  scan_started_at: SCAN_CREATED,
  scan_completed_at: '2026-03-17T09:15:00Z',
  executive_report: null,
  report_generated_at: null,
};

// ─── Seed Account ─────────────────────────────────────────────────────────────

export const seedAccount: IamAccount = {
  account_id: ACCOUNT_ID,
  account_name: ACCOUNT_NAME,
  account_alias: 'techcorp-prod',
  health_score: 54,
  health_score_history: [
    { scan_id: '2026-03-10-account-111122223333-scan-001', score: 51, recorded_at: '2026-03-10T09:15:00Z' },
    { scan_id: '2026-03-11-account-111122223333-scan-001', score: 51, recorded_at: '2026-03-11T09:15:00Z' },
    { scan_id: '2026-03-12-account-111122223333-scan-001', score: 52, recorded_at: '2026-03-12T09:15:00Z' },
    { scan_id: '2026-03-13-account-111122223333-scan-001', score: 52, recorded_at: '2026-03-13T09:15:00Z' },
    { scan_id: '2026-03-14-account-111122223333-scan-001', score: 53, recorded_at: '2026-03-14T09:15:00Z' },
    { scan_id: '2026-03-15-account-111122223333-scan-001', score: 53, recorded_at: '2026-03-15T09:15:00Z' },
    { scan_id: '2026-03-16-account-111122223333-scan-001', score: 54, recorded_at: '2026-03-16T09:15:00Z' },
    { scan_id: SCAN_ID, score: 54, recorded_at: '2026-03-17T09:15:00Z' },
  ],
  last_scanned_at: '2026-03-17T09:15:00Z',
  total_roles: 10,
  high_risk_roles: 4,
  medium_risk_roles: 4,
  low_risk_roles: 2,
};
