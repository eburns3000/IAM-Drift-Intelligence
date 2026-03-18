/**
 * IAM Drift Intelligence — Lambda Response Helpers
 *
 * Produces API Gateway v2 (HTTP API) compatible response objects.
 * CORS headers set here; API Gateway also applies CORS via HttpApi CorsConfiguration.
 */

import { APIGatewayProxyResultV2 } from 'aws-lambda';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

function response(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

export const ok = (body: unknown): APIGatewayProxyResultV2 => response(200, body);
export const created = (body: unknown): APIGatewayProxyResultV2 => response(201, body);
export const badRequest = (message: string): APIGatewayProxyResultV2 =>
  response(400, { error: message });
export const notFound = (message: string): APIGatewayProxyResultV2 =>
  response(404, { error: message });
export const conflict = (message: string): APIGatewayProxyResultV2 =>
  response(409, { error: message });
export const serverError = (message: string): APIGatewayProxyResultV2 =>
  response(500, { error: message, code: 'INTERNAL_ERROR' });

/** Parse body from Lambda event, returning empty object on failure */
export function parseBody<T>(body: string | null | undefined): T {
  if (!body) return {} as T;
  try {
    return JSON.parse(body) as T;
  } catch {
    return {} as T;
  }
}

/** Check if Anthropic API key is configured */
export function isAiConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return Boolean(key && key !== 'your_anthropic_api_key_here');
}
