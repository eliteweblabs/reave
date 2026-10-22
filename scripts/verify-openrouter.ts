/**
 * Verify OpenRouter gateway wiring (endpoint resolution + model slug mapping).
 * Run: npx tsx scripts/verify-openrouter.ts
 */
import assert from 'node:assert/strict';

process.env.OPENROUTER_API_KEY = 'sk-or-test';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_BASE_URL;
delete process.env.OMNIROUTE_BASE_URL;

const { resolveAnthropicEndpoint, isOpenRouterGateway, DEFAULT_OPENROUTER_BASE_URL } = await import(
  '../src/lib/anthropicEndpoint'
);
const { toOpenRouterModelId } = await import('../src/lib/openRouterModel');
const { formatAnthropicApiError, parseLlmErrorPayload } = await import('../src/lib/anthropicMessages');

assert.equal(isOpenRouterGateway(), true);
const endpoint = resolveAnthropicEndpoint();
assert.ok(endpoint);
assert.equal(endpoint.baseUrl, DEFAULT_OPENROUTER_BASE_URL);
assert.equal(endpoint.messagesUrl, `${DEFAULT_OPENROUTER_BASE_URL}/v1/messages`);
assert.equal(endpoint.gatewayKind, 'openrouter');
assert.equal(endpoint.apiKey, 'sk-or-test');
assert.match(endpoint.host, /openrouter\.ai$/);

assert.equal(toOpenRouterModelId('claude-sonnet-4-6'), 'anthropic/claude-sonnet-4.6');
assert.equal(toOpenRouterModelId('claude-haiku-4-5'), 'anthropic/claude-haiku-4.5');
assert.equal(toOpenRouterModelId('claude-opus-5'), 'anthropic/claude-opus-5');
assert.equal(toOpenRouterModelId('anthropic/claude-sonnet-4.6'), 'anthropic/claude-sonnet-4.6');

// OPENROUTER_API_KEY must win over a leftover ANTHROPIC_BASE_URL → api.anthropic.com
process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const endpointMisconfig = resolveAnthropicEndpoint();
assert.ok(endpointMisconfig);
assert.equal(endpointMisconfig.baseUrl, DEFAULT_OPENROUTER_BASE_URL);
assert.equal(endpointMisconfig.messagesUrl, `${DEFAULT_OPENROUTER_BASE_URL}/v1/messages`);

const sample401 =
  '{"type":"error","error":{"type":"authentication_error","message":"User not found.","error_type":"authentication"}}';
assert.equal(parseLlmErrorPayload(sample401).message, 'User not found.');
const friendly = formatAnthropicApiError(401, sample401);
assert.match(friendly, /OpenRouter auth failed \(401\): User not found\./);
assert.match(friendly, /live rejection from OpenRouter/);

console.log('verify-openrouter: ok');
