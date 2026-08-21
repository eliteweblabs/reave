/**
 * Decide whether create_email_filter_rule should insert, skip, or patch.
 *
 * Skipping every enabled `from` match used to swallow "add a forward" requests
 * when a silent junk rule for that sender already existed.
 */
export type EmailFilterRuleWritePlan = 'create' | 'skip' | 'update';

export function planEmailFilterRuleWrite(opts: {
  existing: {
    forwardTo?: string | null;
    createProject?: boolean;
    status: string;
    catalog: boolean;
  } | null;
  forwardTo: string | null;
  createProject?: boolean | null;
  statusRaw: string;
}): EmailFilterRuleWritePlan {
  if (!opts.existing) return 'create';
  const sameForward = (opts.existing.forwardTo ?? null) === (opts.forwardTo ?? null);
  const wantsForwardChange = opts.forwardTo != null && !sameForward;
  const wantsStatusChange = Boolean(opts.statusRaw) && opts.statusRaw !== opts.existing.status;
  const wantsCreateProjectChange =
    opts.createProject === true && opts.existing.createProject !== true;
  if (!wantsForwardChange && !wantsStatusChange && !wantsCreateProjectChange) return 'skip';
  if (opts.existing.catalog) return 'create';
  return 'update';
}

/** Keep + forward unless the user asked to junk/archive. */
export function defaultEmailFilterRuleStatus(opts: {
  statusRaw: string;
  forwardTo: string | null;
}): string {
  if (opts.statusRaw) return opts.statusRaw;
  return opts.forwardTo ? 'CUSTOM' : 'DELETE';
}

export function defaultEmailFilterRuleTitle(opts: {
  title: string;
  sender: string;
  phrases: string[];
  forwardTo: string | null;
}): string {
  if (opts.title) return opts.title;
  if (opts.forwardTo && opts.sender) return `Forward ${opts.sender} → ${opts.forwardTo}`;
  if (opts.forwardTo) return `Forward to ${opts.forwardTo}`;
  if (opts.sender) return `Block sender ${opts.sender}`;
  return `Block: ${opts.phrases[0]?.slice(0, 40) || 'rule'}`;
}

/**
 * Forwarded mail does not auto-create a project unless the rule opts in.
 * Rules without `forwardTo` keep the existing auto-project pipeline.
 */
export function ruleAllowsAutoProject(rule: {
  forwardTo?: string | null;
  createProject?: boolean | null;
} | null | undefined): boolean {
  if (!rule?.forwardTo?.trim()) return true;
  return rule.createProject === true;
}
