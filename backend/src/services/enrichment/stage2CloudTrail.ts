/**
 * IAM Drift Intelligence — Enrichment Stage 2: CloudTrail Evidence
 *
 * Purpose:
 *   Query CloudTrail for actual actions called by this role in the last 90 days.
 *   This produces action-level evidence that:
 *     1. Refines unused_services (removes services that ARE observed in CloudTrail)
 *     2. Populates CloudTrailEvidence for the AI prompt in Stage 3
 *
 * CloudTrail query strategy:
 *   CloudTrail LookupEvents supports filtering by ResourceName (=role ARN) which
 *   finds management events ABOUT the role (e.g. AttachRolePolicy).
 *   To find events BY the role, we filter by Username matching the role session pattern.
 *   Both are combined to build the evidence picture.
 *
 * DynamoDB writes:
 *   - unused_services (refined — removes services seen in CloudTrail)
 *   - last_updated_at
 *
 * Failure behavior:
 *   Non-fatal. If CloudTrail is inaccessible or returns no results, Stage 2
 *   completes successfully with empty evidence. Stage 3 uses IAM last-accessed
 *   data instead.
 */

import {
  CloudTrailClient,
  LookupEventsCommand,
  LookupAttributeKey,
  Event as CloudTrailEvent,
} from '@aws-sdk/client-cloudtrail';
import { EnrichmentContext, StageResult } from './types';
import { CloudTrailEvidence } from '../ai/types';
import { IamFinding } from '../../types';

const REGION = process.env.AWS_REGION || 'us-east-1';
const LOOKBACK_DAYS = 90;
const MAX_EVENTS = 200;

export async function runStage2(ctx: EnrichmentContext): Promise<StageResult> {
  const { finding } = ctx;
  const now = new Date().toISOString();

  let evidence: CloudTrailEvidence | null = null;
  let refinedUnusedServices = finding.unused_services;

  try {
    evidence = await queryCloudTrailEvidence(finding);
    refinedUnusedServices = refineUnusedServices(
      finding.unused_services,
      evidence.observed_services
    );
    ctx.cloudtrail_evidence = evidence;
  } catch (err) {
    // Stage 2 failure is non-fatal — log and continue with no evidence
    console.warn(
      `[stage2] CloudTrail query failed for ${finding.role_name} — proceeding without evidence:`,
      err instanceof Error ? err.message : err
    );
    ctx.cloudtrail_evidence = null;
  }

  const updates: Partial<IamFinding> = {
    unused_services: refinedUnusedServices,
    last_updated_at: now,
  };

  return { stage: 2, success: true, updates };
}

// ─── CloudTrail Query ─────────────────────────────────────────────────────────

async function queryCloudTrailEvidence(
  finding: IamFinding
): Promise<CloudTrailEvidence> {
  const client = new CloudTrailClient({ region: REGION });
  const startTime = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const endTime = new Date();

  const events: CloudTrailEvent[] = [];

  // Query 1: Events where this role ARN is the resource (management events on the role)
  const resourceEvents = await lookupEvents(client, {
    AttributeKey: LookupAttributeKey.RESOURCE_NAME,
    AttributeValue: finding.role_arn,
    startTime,
    endTime,
  });
  events.push(...resourceEvents);

  // Query 2: Events where this role name is the username (events BY the role)
  // IAM assumed-role sessions appear as "{RoleName}/{SessionName}" in CloudTrail
  const usernameEvents = await lookupEvents(client, {
    AttributeKey: LookupAttributeKey.USERNAME,
    AttributeValue: finding.role_name,
    startTime,
    endTime,
  });
  events.push(...usernameEvents);

  return buildEvidence(events, finding.role_name);
}

async function lookupEvents(
  client: CloudTrailClient,
  params: {
    AttributeKey: LookupAttributeKey;
    AttributeValue: string;
    startTime: Date;
    endTime: Date;
  }
): Promise<CloudTrailEvent[]> {
  const collected: CloudTrailEvent[] = [];
  let nextToken: string | undefined;

  do {
    const response = await client.send(
      new LookupEventsCommand({
        LookupAttributes: [
          {
            AttributeKey: params.AttributeKey,
            AttributeValue: params.AttributeValue,
          },
        ],
        StartTime: params.startTime,
        EndTime: params.endTime,
        MaxResults: 50,
        NextToken: nextToken,
      })
    );

    collected.push(...(response.Events ?? []));
    nextToken = response.NextToken;
  } while (nextToken && collected.length < MAX_EVENTS);

  return collected;
}

// ─── Evidence Builder ─────────────────────────────────────────────────────────

function buildEvidence(events: CloudTrailEvent[], roleName: string): CloudTrailEvidence {
  const observedServices = new Set<string>();
  const observedActions = new Set<string>();

  for (const event of events) {
    const eventName = event.EventName ?? '';
    const eventSource = event.EventSource ?? ''; // e.g. 's3.amazonaws.com'

    if (eventName) observedActions.add(eventName);

    if (eventSource) {
      // Convert 's3.amazonaws.com' → 's3', 'iam.amazonaws.com' → 'iam'
      const service = eventSource.split('.')[0].toLowerCase();
      if (service) observedServices.add(service);
    }
  }

  const services = Array.from(observedServices).sort();
  const actions = Array.from(observedActions).sort();

  const summary =
    events.length === 0
      ? `No CloudTrail events found for role ${roleName} in the last ${LOOKBACK_DAYS} days.`
      : `CloudTrail evidence (last ${LOOKBACK_DAYS} days): ` +
        `${events.length} events observed. ` +
        `Services used: ${services.join(', ') || 'none'}. ` +
        `Actions observed: ${actions.slice(0, 20).join(', ')}` +
        (actions.length > 20 ? ` (and ${actions.length - 20} more)` : '');

  return {
    observed_services: services,
    observed_actions: actions,
    summary,
  };
}

// ─── Refinement ───────────────────────────────────────────────────────────────

/**
 * Removes services from unused_services if CloudTrail shows they WERE used.
 * The IAM service last-accessed report (scanner Stage 1) is coarser than CloudTrail;
 * CloudTrail evidence can confirm usage that IAM missed.
 */
function refineUnusedServices(
  currentUnused: string[],
  observedServices: string[]
): string[] {
  if (observedServices.length === 0) return currentUnused;
  const observed = new Set(observedServices);
  return currentUnused.filter((svc) => !observed.has(svc));
}
