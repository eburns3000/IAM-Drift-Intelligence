/**
 * IAM Drift Intelligence — DynamoDB Bootstrap / Seeding
 *
 * Checks if the findings table is empty on startup. If empty, writes all
 * TechCorp seed data (10 roles + 1 scan + 1 account) to DynamoDB.
 *
 * This runs:
 *   - Once per Lambda cold start (via initPromise pattern in handlers)
 *   - Once on Express server startup (in src/index.ts)
 *   - As a standalone CLI script (src/scripts/seedDynamo.ts)
 *
 * Idempotent: PutItem with the same composite keys is safe to run multiple
 * times — it will overwrite with identical data.
 *
 * Only runs when STORAGE_BACKEND=dynamodb. In-memory mode seeds itself
 * automatically via inMemoryRepositories.ts.
 */

import { getRepositories } from '../repositories';
import { seedFindings, seedScan, seedAccount } from './seed';

let _bootstrapped = false;
let _bootstrapPromise: Promise<void> | null = null;

export async function ensureBootstrapped(): Promise<void> {
  if (_bootstrapped) return;
  if (_bootstrapPromise) return _bootstrapPromise;

  _bootstrapPromise = runBootstrap().then(() => {
    _bootstrapped = true;
    _bootstrapPromise = null;
  });

  return _bootstrapPromise;
}

async function runBootstrap(): Promise<void> {
  if ((process.env.STORAGE_BACKEND || 'memory') !== 'dynamodb') return;

  const repos = getRepositories();

  const count = await repos.findings.count();
  if (count > 0) {
    console.log(`[bootstrap] DynamoDB already seeded (${count} findings). Skipping.`);
    return;
  }

  console.log('[bootstrap] DynamoDB is empty — seeding TechCorp dataset...');

  await Promise.all(seedFindings.map((f) => repos.findings.put(f)));
  console.log(`[bootstrap] Seeded ${seedFindings.length} findings`);

  await repos.scans.put(seedScan);
  console.log('[bootstrap] Seeded 1 scan');

  await repos.accounts.put(seedAccount);
  console.log('[bootstrap] Seeded 1 account (TechCorp)');

  console.log('[bootstrap] TechCorp dataset ready in DynamoDB');
}

export async function forceSeed(): Promise<void> {
  _bootstrapped = false;
  _bootstrapPromise = null;

  const repos = getRepositories();
  await Promise.all(seedFindings.map((f) => repos.findings.put(f)));
  await repos.scans.put(seedScan);
  await repos.accounts.put(seedAccount);

  console.log(
    `[bootstrap] Force-seeded ${seedFindings.length} findings + 1 scan + 1 account`
  );
  _bootstrapped = true;
}
