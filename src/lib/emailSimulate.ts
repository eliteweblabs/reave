/**
 * Dry-run email triage for the Admin Rules Lab.
 * Uses the same processInboundEmail / evaluateEmailRules path as production —
 * never a parallel rule table.
 */

import { parseSenderEmail } from './emailAddress';
import { getCompanyBrandContext } from './companyConfig';
import {
  processInboundEmail,
  type ProcessedEmailResult,
  type ProcessInboundOptions,
} from './emailProcessor';
import { isAllowedSender } from './inboundEmailAllowlist';
import { getInboundSince, isInboundEmailAllowed } from './inboundEmailSince';
import { parseEmailDate } from './emailDate';
import { isSleepModeActive, sleepModeStatus } from './pushQuietHours';
import {
  isEmailRuleExpired,
  storeListEmailRules,
  type EmailRuleRecord,
} from './emailRuleStore';
import { isSilentTriageStatus, type InboundEmail, type RuleEvaluation } from './emailRules';
import type { ClassificationAuditStep } from './emailClassificationAudit';

export type TriagePlaybackStep = {
  id: string;
  /** Stable stage key for UI highlighting */
  stage: string;
  label: string;
  kind: 'gate' | 'rule' | 'function' | 'outcome';
  /** ran = executed; matched = winning rule; skipped = short-circuit; would = dry-run side effect */
  status: 'ran' | 'matched' | 'skipped' | 'no_match' | 'disabled' | 'would' | 'blocked';
  decision: string;
  detail?: string;
  ruleId?: string;
};

export type SimulateInboundEmailResult = {
  ok: true;
  dryRun: true;
  inboundAddressExample: string;
  gates: {
    sleepMode: boolean;
    sleepLabel: string | null;
    inboundSince: string | null;
    beforeCutoff: boolean;
    allowlisted: boolean;
  };
  /** Null when a gate blocked triage before processInboundEmail. */
  result: ProcessedEmailResult | null;
  steps: TriagePlaybackStep[];
  ruleEvaluations: RuleEvaluation[];
  classificationAudit: ClassificationAuditStep[];
  /** Rules in the order used for this simulation (after optional override). */
  rulesUsed: Array<Pick<EmailRuleRecord, 'id' | 'title' | 'status' | 'sortOrder' | 'enabled' | 'notify'>>;
};

export type SimulateInboundInput = {
  email: InboundEmail;
  /**
   * Optional full rule-id order for this dry-run only (does not persist).
   * Missing ids are appended in their current sort order.
   */
  ruleOrder?: string[];
  /** When true, skip sleep/cutoff/allowlist gates (test triage core only). */
  skipGates?: boolean;
};

function reorderRules(
  rules: EmailRuleRecord[],
  ruleOrder?: string[],
): EmailRuleRecord[] {
  if (!ruleOrder?.length) {
    return [...rules].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  }
  const byId = new Map(rules.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const ordered: EmailRuleRecord[] = [];
  for (const id of ruleOrder) {
    const rule = byId.get(String(id));
    if (!rule || seen.has(rule.id)) continue;
    seen.add(rule.id);
    ordered.push(rule);
  }
  for (const rule of [...rules].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!seen.has(rule.id)) ordered.push(rule);
  }
  return ordered.map((r, i) => ({ ...r, sortOrder: i }));
}

function stepsFromGates(opts: {
  sleepMode: boolean;
  sleepLabel: string | null;
  inboundSince: string | null;
  beforeCutoff: boolean;
  allowlisted: boolean;
  skipGates: boolean;
}): TriagePlaybackStep[] {
  if (opts.skipGates) {
    return [
      {
        id: 'gate-skip',
        stage: 'gates',
        label: 'Inbound gates',
        kind: 'gate',
        status: 'skipped',
        decision: 'Gates skipped for this lab run',
        detail: 'Sleep / cutoff / allowlist not applied',
      },
    ];
  }
  const steps: TriagePlaybackStep[] = [];
  if (opts.sleepMode) {
    steps.push({
      id: 'gate-sleep',
      stage: 'sleep',
      label: 'Sleep mode',
      kind: 'gate',
      status: 'blocked',
      decision: 'Deferred — quiet hours active',
      detail: opts.sleepLabel || 'Sleep mode',
    });
    return steps;
  }
  steps.push({
    id: 'gate-sleep',
    stage: 'sleep',
    label: 'Sleep mode',
    kind: 'gate',
    status: 'ran',
    decision: 'Awake — continue triage',
  });

  if (opts.beforeCutoff) {
    steps.push({
      id: 'gate-cutoff',
      stage: 'cutoff',
      label: 'Inbound since cutoff',
      kind: 'gate',
      status: 'blocked',
      decision: 'Ignored — before go-live cutoff',
      detail: opts.inboundSince || undefined,
    });
    return steps;
  }
  steps.push({
    id: 'gate-cutoff',
    stage: 'cutoff',
    label: 'Inbound since cutoff',
    kind: 'gate',
    status: 'ran',
    decision: 'After cutoff — continue',
    detail: opts.inboundSince || 'No cutoff set',
  });

  if (!opts.allowlisted) {
    steps.push({
      id: 'gate-allowlist',
      stage: 'allowlist',
      label: 'Sender allowlist',
      kind: 'gate',
      status: 'blocked',
      decision: 'Rejected — sender not on allowlist',
    });
    return steps;
  }
  steps.push({
    id: 'gate-allowlist',
    stage: 'allowlist',
    label: 'Sender allowlist',
    kind: 'gate',
    status: 'ran',
    decision: 'Sender allowed',
  });
  return steps;
}

function stepsFromRuleEvaluations(evaluations: RuleEvaluation[]): TriagePlaybackStep[] {
  return evaluations.map((ev, i) => {
    const title = (ev.rule as EmailRuleRecord).title || ev.rule.status;
    const status: TriagePlaybackStep['status'] =
      ev.outcome === 'matched'
        ? 'matched'
        : ev.outcome === 'no_match' || ev.outcome === 'pinned_checked'
          ? 'no_match'
          : ev.outcome === 'disabled'
            ? 'disabled'
            : 'skipped';
    const decision =
      ev.outcome === 'matched'
        ? `Matched → ${ev.rule.status}`
        : ev.outcome === 'no_match'
          ? 'No match — keep walking'
          : ev.outcome === 'pinned_checked'
            ? 'Pinned check — no match'
            : ev.outcome === 'disabled'
              ? 'Disabled — skipped'
              : 'Skipped (earlier rule won)';
    return {
      id: `rule-${i}-${ev.rule.status}`,
      stage: 'rules',
      label: title,
      kind: 'rule' as const,
      status,
      decision,
      detail: ev.rule.phrases?.length
        ? `Phrases: ${ev.rule.phrases.slice(0, 4).map((p) => `"${p}"`).join(', ')}`
        : ev.rule.description,
      ruleId: (ev.rule as EmailRuleRecord).id,
    };
  });
}

function stepsFromAuditAndResult(
  result: ProcessedEmailResult,
): TriagePlaybackStep[] {
  const steps: TriagePlaybackStep[] = [];
  const audit = result.classificationAudit || [];

  // Contact / AI / downstream — derive from result fields + audit (no second pipeline).
  steps.push({
    id: 'fn-contact',
    stage: 'contact',
    label: 'Resolve sender',
    kind: 'function',
    status: 'ran',
    decision: result.contactUid
      ? `Matched contact${result.contactName ? `: ${result.contactName}` : ''}`
      : 'Unknown sender',
    detail: result.clientKind ? `clientKind=${result.clientKind}` : 'Not in Contacts',
  });

  const agentFirst =
    !result.contactUid || result.clientKind === 'service';
  const silent =
    result.ruleEvaluations?.some(
      (e) =>
        e.outcome === 'matched' &&
        (!e.rule.notify || isSilentTriageStatus(e.rule.status)),
    ) ?? false;

  if (silent) {
    steps.push({
      id: 'fn-ai',
      stage: 'ai',
      label: 'Agent-first AI',
      kind: 'function',
      status: 'skipped',
      decision: 'Skipped — silent rule short-circuit',
    });
  } else if (agentFirst) {
    const ai = result.aiClassify;
    if (ai) {
      steps.push({
        id: 'fn-ai',
        stage: 'ai',
        label: 'Agent-first AI',
        kind: 'function',
        status: result.needsExplain ? 'ran' : 'matched',
        decision: result.needsExplain
          ? `Low confidence (${Math.round(ai.confidence * 100)}% on ${ai.label}) — rules fallback`
          : `Trusted ${ai.label} (${Math.round(ai.confidence * 100)}%)`,
        detail: ai.reason || ai.summary,
      });
    } else {
      steps.push({
        id: 'fn-ai',
        stage: 'ai',
        label: 'Agent-first AI',
        kind: 'function',
        status: 'ran',
        decision: 'AI unavailable or disabled — rules path',
      });
    }
  } else {
    steps.push({
      id: 'fn-ai',
      stage: 'ai',
      label: 'Rules + AI triage',
      kind: 'function',
      status: 'ran',
      decision: 'Known professional/personal — rules-first path',
      detail: result.aiClassify
        ? `Legacy AI: ${result.aiClassify.label}`
        : undefined,
    });
  }

  const interestingAudit = audit.filter(
    (s) =>
      !['simulate', 'rules', 'persist'].includes(s.step) &&
      !s.step.startsWith('rules'),
  );
  for (const [i, s] of interestingAudit.entries()) {
    const isWould = /would/i.test(s.decision);
    steps.push({
      id: `audit-${i}-${s.step}`,
      stage: s.step,
      label: s.step.replace(/_/g, ' '),
      kind: isWould || s.step === 'forward' || s.step === 'push' || s.step === 'agent' ? 'outcome' : 'function',
      status: isWould ? 'would' : 'ran',
      decision: s.decision,
      detail: s.detail,
    });
  }

  steps.push({
    id: 'outcome',
    stage: 'outcome',
    label: 'Projected outcome',
    kind: 'outcome',
    status: 'matched',
    decision: `${result.status} · ${result.category} · ${result.action}`,
    detail: [
      result.summary,
      result.routeNote,
      result.wouldNotify ? 'Would notify' : 'Silent',
      result.wouldAgentAlert ? 'Would agent-alert' : null,
      result.wouldForwardTo ? `Would forward → ${result.wouldForwardTo}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  });

  return steps;
}

/**
 * Run the production inbound triage pipeline in dry-run mode and return a
 * step-by-step playback list for the Rules Lab visualizer.
 */
export async function simulateInboundEmail(
  input: SimulateInboundInput,
): Promise<SimulateInboundEmailResult> {
  const email = input.email;
  const skipGates = input.skipGates === true;
  const brand = await getCompanyBrandContext().catch(() => null);
  const inboundAddressExample =
    brand?.inboundEmailExample || 'inbox@inbound.example.com';

  const config = await storeListEmailRules();
  const ordered = reorderRules(config.rules, input.ruleOrder);
  // Keep disabled rules for the walk (shown as disabled); drop expired like production.
  const rulesForClassify = ordered.filter((r) => !isEmailRuleExpired(r));

  let sleepMode = false;
  let sleepLabel: string | null = null;
  let inboundSince: string | null = null;
  let beforeCutoff = false;
  let allowlisted = true;

  if (!skipGates) {
    sleepMode = await isSleepModeActive();
    if (sleepMode) {
      const st = await sleepModeStatus();
      sleepLabel = st.label;
    }
    // Read-only — do not auto-initialize cutoff from the lab.
    const since = await getInboundSince();
    inboundSince = since?.toISOString() ?? null;
    const emailDate = parseEmailDate(email.headers) ?? new Date();
    beforeCutoff = !isInboundEmailAllowed(emailDate, since);
    allowlisted = isAllowedSender(email.from ?? '');
  }

  const gateSteps = stepsFromGates({
    sleepMode,
    sleepLabel,
    inboundSince,
    beforeCutoff,
    allowlisted,
    skipGates,
  });

  if (!skipGates && (sleepMode || beforeCutoff || !allowlisted)) {
    return {
      ok: true,
      dryRun: true,
      inboundAddressExample,
      gates: { sleepMode, sleepLabel, inboundSince, beforeCutoff, allowlisted },
      result: null,
      steps: gateSteps,
      ruleEvaluations: [],
      classificationAudit: [],
      rulesUsed: rulesForClassify.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        sortOrder: r.sortOrder,
        enabled: r.enabled,
        notify: r.notify,
      })),
    };
  }

  const processOpts: ProcessInboundOptions = {
    dryRun: true,
    rules: rulesForClassify,
    notifyOnUnmatched: config.notifyOnUnmatched,
  };

  const result = await processInboundEmail(email, processOpts);
  const ruleEvals = result.ruleEvaluations || [];
  const steps: TriagePlaybackStep[] = [
    ...gateSteps,
    {
      id: 'fn-normalize',
      stage: 'normalize',
      label: 'Normalize message',
      kind: 'function',
      status: 'ran',
      decision: 'Parsed body, attachments, OTP digits',
      detail: [
        `from ${parseSenderEmail(email.from ?? '') || email.from || '(none)'}`,
        email.attachments?.length ? `${email.attachments.length} attachment(s)` : null,
        result.verificationCode ? `code ${result.verificationCode}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    },
    ...stepsFromRuleEvaluations(ruleEvals),
    ...stepsFromAuditAndResult(result),
  ];

  return {
    ok: true,
    dryRun: true,
    inboundAddressExample,
    gates: { sleepMode, sleepLabel, inboundSince, beforeCutoff, allowlisted },
    result,
    steps,
    ruleEvaluations: ruleEvals,
    classificationAudit: result.classificationAudit || [],
    rulesUsed: rulesForClassify.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      sortOrder: r.sortOrder,
      enabled: r.enabled,
      notify: r.notify,
    })),
  };
}
