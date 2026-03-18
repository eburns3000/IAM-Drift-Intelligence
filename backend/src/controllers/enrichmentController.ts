/**
 * IAM Drift Intelligence — Enrichment Controller
 *
 * Orchestrates the 5-stage enrichment pipeline for a single role finding.
 * Called by the enrichmentHandler with the deserialized SQS message.
 *
 * Stage execution contract:
 *   - Stages run sequentially: 1 → 2 → 3 → 4 → 5
 *   - Each stage reads ctx.finding (in-memory), performs work, returns StageResult
 *   - Stage updates are applied to ctx.finding in-memory AND written to DynamoDB
 *   - If a stage fails, its error status is written but subsequent stages still run
 *   - Stage 4 skips itself if ai_status is FAILED (no proposed policy to simulate)
 *   - Stage 5 always runs — it publishes whatever state has been accumulated
 *
 * DynamoDB write pattern:
 *   After each stage, only the delta (StageResult.updates) is written via
 *   findingsRepository.update(). This avoids full-item overwrites and preserves
 *   concurrent writes from other processes.
 */

import { getRepositories } from '../repositories';
import { EnrichmentJobMessage } from '../services/scanner/types';
import { EnrichmentContext } from '../services/enrichment/types';
import { runStage1 } from '../services/enrichment/stage1Normalize';
import { runStage2 } from '../services/enrichment/stage2CloudTrail';
import { runStage3 } from '../services/enrichment/stage3AiPolicy';
import { runStage4 } from '../services/enrichment/stage4Simulator';
import { runStage5 } from '../services/enrichment/stage5Assemble';
import { IamFinding } from '../types';

export async function runEnrichment(message: EnrichmentJobMessage): Promise<void> {
  const { scan_id, role_id } = message;
  const repos = getRepositories();

  // Load the finding written by the scanner
  const finding = await repos.findings.get(scan_id, role_id);
  if (!finding) {
    throw new Error(
      `[enrichment] Finding not found: scan_id=${scan_id} role_id=${role_id}. ` +
      `Scanner may not have completed for this role.`
    );
  }

  const ctx: EnrichmentContext = {
    finding: { ...finding },
    cloudtrail_evidence: null,
  };

  console.log(
    `[enrichment] Starting pipeline for ${finding.role_name} ` +
    `(scan: ${scan_id}, status: ${finding.finding_status})`
  );

  // ── Run all 5 stages ──────────────────────────────────────────────────────
  const stages = [runStage1, runStage2, runStage3, runStage4, runStage5];

  for (const runStage of stages) {
    const result = await runStage(ctx);

    // Apply updates to in-memory context
    ctx.finding = { ...ctx.finding, ...result.updates };

    // Write delta to DynamoDB after each stage
    if (Object.keys(result.updates).length > 0) {
      try {
        await repos.findings.update(scan_id, role_id, result.updates);
      } catch (writeErr) {
        // DynamoDB write failure is logged but does not stop the pipeline
        console.error(
          `[enrichment] DynamoDB write failed after stage ${result.stage} ` +
          `for ${finding.role_name}:`,
          writeErr
        );
      }
    }

    if (!result.success) {
      console.warn(
        `[enrichment] Stage ${result.stage} failed for ${finding.role_name}: ${result.error}`
      );
      // Continue to next stage — each stage is independent
    } else {
      console.log(`[enrichment] Stage ${result.stage} complete for ${finding.role_name}`);
    }
  }

  // Write alert_sent if Stage 5 set it (it mutates ctx.finding directly)
  if (ctx.finding.alert_sent && !finding.alert_sent) {
    await repos.findings.update(scan_id, role_id, { alert_sent: true }).catch(() => {});
  }

  console.log(
    `[enrichment] Pipeline complete for ${finding.role_name} — ` +
    `final state: ${ctx.finding.finding_status} / ${ctx.finding.workflow_state}`
  );
}
