/**
 * IAM Drift Intelligence — AI Provider Factory
 *
 * Returns the correct AIProvider implementation based on AI_PROVIDER env var.
 *   'anthropic' → AnthropicProvider (default)
 *   'bedrock'   → BedrockProvider (future — implement and register here)
 *
 * No handler or controller code changes required to swap providers.
 */

import { AIProvider } from './types';
import { AnthropicProvider } from './anthropicProvider';

let _provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (_provider) return _provider;

  const name = process.env.AI_PROVIDER || 'anthropic';

  switch (name) {
    case 'anthropic':
      _provider = new AnthropicProvider();
      break;
    default:
      throw new Error(
        `Unknown AI_PROVIDER: "${name}". Supported values: anthropic, bedrock`
      );
  }

  console.log(`[ai] Using provider: ${_provider.providerName} / ${_provider.modelId}`);
  return _provider;
}

export type { AIProvider } from './types';
export type {
  RemediationBundleInput,
  RemediationBundleOutput,
  ExecutiveSummaryInput,
  ExecutiveSummaryOutput,
  CloudTrailEvidence,
} from './types';
