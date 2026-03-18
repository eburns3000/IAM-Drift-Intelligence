/**
 * IAM Drift Intelligence — DynamoDB Seed Script
 *
 * Standalone script to force-seed the TechCorp dataset into DynamoDB.
 *
 * Usage:
 *   STORAGE_BACKEND=dynamodb DYNAMODB_ENDPOINT=http://localhost:8000 npm run seed:dynamo
 *   # Or against AWS DynamoDB (with credentials configured):
 *   STORAGE_BACKEND=dynamodb npm run seed:dynamo
 */

import 'dotenv/config';
import { forceSeed } from '../data/bootstrap';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  IAM Drift Intelligence — DynamoDB Seed');
console.log(`  Endpoint: ${process.env.DYNAMODB_ENDPOINT || 'AWS DynamoDB (us-east-1)'}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

forceSeed()
  .then(() => {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ✓ TechCorp dataset seeded successfully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    process.exit(0);
  })
  .catch((err) => {
    console.error('✗ Seed failed:', err);
    process.exit(1);
  });
