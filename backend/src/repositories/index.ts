/**
 * IAM Drift Intelligence — Repository Factory
 *
 * Returns the correct repository implementation based on STORAGE_BACKEND env var.
 *   memory   → InMemoryRepositories (default, no AWS needed)
 *   dynamodb → DynamoRepositories (requires DynamoDB Local or AWS)
 */

import { Repositories } from './interfaces';
import { createDynamoRepositories } from './dynamoRepositories';
import { createInMemoryRepositories } from './inMemoryRepositories';

let _repos: Repositories | null = null;

export function getRepositories(): Repositories {
  if (_repos) return _repos;

  const backend = process.env.STORAGE_BACKEND || 'memory';

  if (backend === 'dynamodb') {
    _repos = createDynamoRepositories();
  } else {
    _repos = createInMemoryRepositories();
  }

  return _repos;
}

export type { Repositories } from './interfaces';
