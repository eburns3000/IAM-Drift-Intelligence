/**
 * IAM Drift Intelligence — Express Server (Local Development)
 *
 * Mirrors the Lambda handler routing for fast local development.
 * The same controllers and repositories run in both environments.
 *
 * Local development paths:
 *
 *   Path A — Fast local dev (default, STORAGE_BACKEND=memory):
 *     npm run dev
 *     → Express + in-memory store, seeded TechCorp data, no AWS infra needed
 *
 *   Path B — DynamoDB Local dev (STORAGE_BACKEND=dynamodb):
 *     docker run -p 8000:8000 amazon/dynamodb-local
 *     STORAGE_BACKEND=dynamodb DYNAMODB_ENDPOINT=http://localhost:8000 npm run dev
 *     npm run seed:dynamo  (on first run to populate tables)
 *
 *   Path C — SAM local Lambda + API Gateway:
 *     sam build && sam local start-api
 *     → Tests actual Lambda handlers with DynamoDB Local
 *
 * Target AWS architecture:
 *   API Gateway → ApiHandler Lambda → DynamoDB
 *   This Express server is replaced by API Gateway on deployment.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ensureBootstrapped } from './data/bootstrap';

import scanRoutes from './routes/scans';
import findingRoutes from './routes/findings';
import dashboardRoutes from './routes/dashboard';
import reportRoutes from './routes/reports';

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());

app.use((req, _res, next) => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      method: req.method,
      path: req.path,
    })
  );
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/scans', scanRoutes);
app.use('/api/findings', findingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);

app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'iam-drift-intelligence-api',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    storageBackend: process.env.STORAGE_BACKEND || 'memory',
    aiProvider: process.env.AI_PROVIDER || 'anthropic',
  });
});

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), error: err.message }));
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function start() {
  await ensureBootstrapped();

  app.listen(PORT, () => {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        message: `IAM Drift Intelligence API running on port ${PORT}`,
        storageBackend: process.env.STORAGE_BACKEND || 'memory',
        aiProvider: process.env.AI_PROVIDER || 'anthropic',
      })
    );
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
