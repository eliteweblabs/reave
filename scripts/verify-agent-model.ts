/**
 * Smoke tests for Auto model routing (Haiku / Sonnet / Opus).
 * Run: npm run check:agent-model
 */
import assert from 'node:assert/strict';
import {
  AGENT_MODEL_AUTO,
  AUTO_AGENT_MODELS,
  isAgentModelAuto,
  labelForAgentModel,
  normalizeAgentModelInput,
  pickAutoAgentModel,
} from '../src/lib/agentModel.ts';

assert.equal(normalizeAgentModelInput('auto'), AGENT_MODEL_AUTO);
assert.equal(normalizeAgentModelInput('claude-auto'), AGENT_MODEL_AUTO);
assert.equal(isAgentModelAuto('auto'), true);
assert.equal(isAgentModelAuto('claude-sonnet-4-6'), false);
assert.equal(labelForAgentModel('auto'), 'Auto');

assert.equal(pickAutoAgentModel({ userText: 'thanks' }), AUTO_AGENT_MODELS.light);
assert.equal(pickAutoAgentModel({ userText: 'list my contacts' }), AUTO_AGENT_MODELS.light);
assert.equal(pickAutoAgentModel({ userText: 'Who is Acme?' }), AUTO_AGENT_MODELS.light);
assert.equal(
  pickAutoAgentModel({ userText: 'Draft a polite reply to this client about the invoice delay and propose two times next week.' }),
  AUTO_AGENT_MODELS.default,
);
assert.equal(
  pickAutoAgentModel({ userText: 'Please refactor the billing architecture and compare tradeoffs.' }),
  AUTO_AGENT_MODELS.heavy,
);
assert.equal(pickAutoAgentModel({ userText: 'quick answer: is the site up?' }), AUTO_AGENT_MODELS.light);
assert.equal(pickAutoAgentModel({ userText: 'use opus for this' }), AUTO_AGENT_MODELS.heavy);
assert.equal(
  pickAutoAgentModel({ userText: 'hi', hasImages: true }),
  AUTO_AGENT_MODELS.default,
);
assert.equal(
  pickAutoAgentModel({ userText: 'look at this pdf', hasDocs: true }),
  AUTO_AGENT_MODELS.default,
);
assert.equal(
  pickAutoAgentModel({ userText: 'do we have Clerk?' }),
  AUTO_AGENT_MODELS.default,
);
assert.equal(
  pickAutoAgentModel({ userText: 'check if Clerk is wired' }),
  AUTO_AGENT_MODELS.default,
);
assert.equal(
  pickAutoAgentModel({ userText: 'is Vapi installed in this app' }),
  AUTO_AGENT_MODELS.default,
);
assert.equal(
  pickAutoAgentModel({ userText: 'check if we have Clerk' }),
  AUTO_AGENT_MODELS.default,
);

console.log('ok: agent model auto routing');
