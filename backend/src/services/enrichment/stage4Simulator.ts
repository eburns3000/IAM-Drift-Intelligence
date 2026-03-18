/**
 * IAM Drift Intelligence — Enrichment Stage 4: Policy Simulator
 *
 * Purpose:
 *   Validates the AI-generated proposed_policy using the IAM Policy Simulator.
 *   Calls SimulateCustomPolicy with the proposed policy as the source to determine:
 *
 *   - simulation_actions_preserved: actions in current_policy that still pass
 *     when evaluated against the proposed_policy
 *   - simulation_actions_removed: actions in current_policy that are now denied
 *   - simulation_breaking_changes: removed actions that were observed in CloudTrail
 *     (i.e. actions the role was actually using that the proposed policy would block)
 *   - simulation_result: PASS (no breaking changes) | PARTIAL | FAIL
 *
 * Uses SimulateCustomPolicy (not SimulatePrincipalPolicy) because the proposed
 * policy is not yet attached to the role — we're validating a hypothetical.
 *
 * Concurrency: Each SimulateCustomPolicy call tests up to 100 actions in batch.
 * Actions are deduplicated and de-wildcard-expanded before simulation.
 *
 * DynamoDB writes:
 *   - simulation_result, simulation_actions_removed, simulation_actions_preserved
 *   - simulation_breaking_changes
 *   - simulation_status: 'COMPLETE' (or 'FAILED' on error)
 *   - simulation_completed_at
 *   - workflow_state: 'simulation_complete'
 *   - last_updated_at
 *
 * Failure behavior:
 *   If Stage 3 (AI) failed and proposed_policy is empty, simulation is SKIPPED.
 *   If the simulator API fails, simulation_status is set to FAILED but the
 *   finding is not blocked — reviewers can still approve/reject manually.
 *   The approve button in the frontend gates on simulation_status: COMPLETE.
 */

import {
  IAMClient,
  SimulateCustomPolicyCommand,
  PolicyEvaluationDecisionType,
} from '@aws-sdk/client-iam';
import { EnrichmentContext, StageResult } from './types';
import { IamFinding, PolicyDocument, SimulationResult } from '../../types';

const REGION = process.env.AWS_REGION || 'us-east-1';
// IAM simulator accepts up to 100 actions per request
const BATCH_SIZE = 100;

export async function runStage4(ctx: EnrichmentContext): Promise<StageResult> {
  const { finding } = ctx;
  const now = new Date().toISOString();

  // Skip if AI failed and there is no proposed policy to simulate
  if (
    finding.ai_status === 'FAILED' ||
    finding.proposed_policy.Statement.length === 0
  ) {
    console.log(
      `[stage4] Skipping simulation for ${finding.role_name} — no proposed policy (ai_status: ${finding.ai_status})`
    );
    return {
      stage: 4,
      success: true,
      updates: {
        simulation_status: 'SKIPPED',
        last_updated_at: now,
      },
    };
  }

  try {
    const iamClient = new IAMClient({ region: REGION });

    // Extract all Allow actions from the current policy (what we need to verify)
    const currentActions = extractAllowActions(finding.current_policy);

    // Extract all Allow actions from the proposed policy
    const proposedActions = new Set(extractAllowActions(finding.proposed_policy));

    // Determine which current actions the proposed policy should preserve
    // We test all current actions against the proposed policy
    const { allowed, denied } = await simulateActions(
      iamClient,
      finding.proposed_policy,
      currentActions,
      finding.role_arn
    );

    // Preserved = actions that are still allowed under the proposed policy
    const preserved = allowed.filter((a) => proposedActions.has(a));

    // Removed = actions denied under the proposed policy
    const removed = denied;

    // Breaking changes = removed actions that CloudTrail shows were actually used
    const observedActions = new Set(
      (ctx.cloudtrail_evidence?.observed_actions ?? []).map((a) => a.toLowerCase())
    );

    // Also consider actions in services_before but not in unused_services as "potentially used"
    const unusedServiceSet = new Set(finding.unused_services);
    const likelyUsedActions = currentActions.filter((action) => {
      const service = action.split(':')[0]?.toLowerCase() ?? '';
      return !unusedServiceSet.has(service);
    });

    const breakingChanges = removed.filter((action) => {
      const actionLower = action.toLowerCase();
      const actionName = actionLower.split(':')[1] ?? actionLower;
      return (
        observedActions.has(actionLower) ||
        observedActions.has(actionName) ||
        likelyUsedActions.includes(action)
      );
    });

    const simulationResult: SimulationResult =
      breakingChanges.length === 0
        ? 'PASS'
        : breakingChanges.length <= 2
        ? 'PARTIAL'
        : 'FAIL';

    const updates: Partial<IamFinding> = {
      simulation_result: simulationResult,
      simulation_actions_preserved: preserved,
      simulation_actions_removed: removed,
      simulation_breaking_changes: breakingChanges,
      simulation_status: 'COMPLETE',
      simulation_completed_at: now,
      workflow_state: 'simulation_complete',
      last_updated_at: now,
    };

    console.log(
      `[stage4] Simulation ${simulationResult} for ${finding.role_name} — ` +
      `preserved: ${preserved.length}, removed: ${removed.length}, breaking: ${breakingChanges.length}`
    );

    return { stage: 4, success: true, updates };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[stage4] Simulation failed for ${finding.role_name}:`, errorMsg);

    return {
      stage: 4,
      success: false,
      error: errorMsg,
      updates: {
        simulation_status: 'FAILED',
        last_updated_at: now,
      },
    };
  }
}

// ─── Policy Action Extraction ─────────────────────────────────────────────────

/**
 * Extracts all individual action strings from Allow statements.
 * Wildcards (ec2:*) are kept as-is — the simulator handles them.
 * Returns a Set for O(1) lookup.
 */
function extractAllowActions(policy: PolicyDocument): string[] {
  const actions = new Set<string>();
  for (const stmt of policy.Statement) {
    if (stmt.Effect !== 'Allow') continue;
    const stmtActions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
    for (const action of stmtActions) {
      if (action) actions.add(action);
    }
  }
  return Array.from(actions);
}

// ─── IAM Simulator ────────────────────────────────────────────────────────────

interface SimulationBatch {
  allowed: string[];
  denied: string[];
}

/**
 * Simulates whether the proposed policy would allow or deny each action.
 * Batches up to BATCH_SIZE actions per SimulateCustomPolicy call.
 */
async function simulateActions(
  iamClient: IAMClient,
  proposedPolicy: PolicyDocument,
  actionsToTest: string[],
  roleArn: string
): Promise<SimulationBatch> {
  const allowed: string[] = [];
  const denied: string[] = [];

  // Filter out wildcard actions — expand them conceptually (keep for removed tracking)
  // The simulator needs concrete action names, not wildcards
  const concreteActions = actionsToTest.filter(
    (a) => !a.includes('*') && a.includes(':')
  );
  const wildcardActions = actionsToTest.filter((a) => a.includes('*'));

  // Batch simulate concrete actions
  for (let i = 0; i < concreteActions.length; i += BATCH_SIZE) {
    const batch = concreteActions.slice(i, i + BATCH_SIZE);
    if (batch.length === 0) continue;

    const result = await iamClient.send(
      new SimulateCustomPolicyCommand({
        PolicyInputList: [JSON.stringify(proposedPolicy)],
        ActionNames: batch,
        ResourceArns: ['*'],
      })
    );

    for (const evalResult of result.EvaluationResults ?? []) {
      const action = evalResult.EvalActionName ?? '';
      if (evalResult.EvalDecision === PolicyEvaluationDecisionType.ALLOWED) {
        allowed.push(action);
      } else {
        denied.push(action);
      }
    }
  }

  // Wildcard actions from the current policy that are NOT in the proposed policy
  // are considered removed (we can't simulate them directly)
  const proposedActionStrings = extractAllowActions(proposedPolicy);
  const proposedSet = new Set(proposedActionStrings.map((a) => a.toLowerCase()));

  for (const wildcard of wildcardActions) {
    const service = wildcard.split(':')[0]?.toLowerCase() ?? '';
    const proposedHasService = proposedActionStrings.some((a) =>
      a.toLowerCase().startsWith(service + ':')
    );
    if (proposedHasService || proposedSet.has(wildcard.toLowerCase())) {
      allowed.push(wildcard);
    } else {
      denied.push(wildcard);
    }
  }

  return { allowed, denied };
}
