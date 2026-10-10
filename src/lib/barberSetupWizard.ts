import type { BarberPaymentsConfig } from './barberPayments';

export type BarberSetupStepId =
  | 'welcome'
  | 'cal'
  | 'payments'
  | 'sync'
  | 'test'
  | 'nfc'
  | 'done';

export type BarberSetupStep = {
  id: BarberSetupStepId;
  title: string;
  optional?: boolean;
};

export const BARBER_SETUP_STEPS: readonly BarberSetupStep[] = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'cal', title: 'Calendar login' },
  { id: 'payments', title: 'How clients pay' },
  { id: 'sync', title: 'Apply & sync' },
  { id: 'test', title: 'Test booking' },
  { id: 'nfc', title: 'NFC staff card' },
  { id: 'done', title: 'Go live' },
];

/** URL to program on NFC chips (same pattern as Barry Levine / LevinesLaw). */
export function barberNfcCardUrl(opts: {
  siteOrigin: string;
  staffAppOrigin?: string | null;
  preferSitePath?: boolean;
}): string {
  const site = opts.siteOrigin.replace(/\/$/, '');
  if (opts.preferSitePath !== false) {
    return `${site}/card`;
  }
  const staff = opts.staffAppOrigin?.trim().replace(/\/$/, '');
  if (staff) return `${staff}/card`;
  return `${site}/card`;
}

export type BarberSetupWizardState = {
  steps: Record<BarberSetupStepId, boolean>;
  finished: boolean;
  payments?: BarberPaymentsConfig;
};

export function emptyBarberSetupState(): BarberSetupWizardState {
  const steps = Object.fromEntries(
    BARBER_SETUP_STEPS.map((s) => [s.id, s.id === 'welcome']),
  ) as Record<BarberSetupStepId, boolean>;
  return { steps, finished: false };
}

export function barberSetupWizardUrl(siteOrigin: string, secret: string): string {
  const base = siteOrigin.replace(/\/$/, '');
  return `${base}/setup?key=${encodeURIComponent(secret)}`;
}

export type BarberSetupProbe = {
  siteOk: boolean;
  calOk: boolean;
  calUrl: string;
  bookUrl: string;
  paymentMode: string;
  hasVenmoOrCashapp: boolean;
  setupBanner: boolean;
  canAutoApply: boolean;
};

export function parsePaymentsPayload(raw: unknown): BarberPaymentsConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const mode = o.mode === 'stripe' ? 'stripe' : o.mode === 'p2p' ? 'p2p' : undefined;
  return {
    mode,
    venmo: typeof o.venmo === 'string' ? o.venmo : undefined,
    cashapp: typeof o.cashapp === 'string' ? o.cashapp : undefined,
    zelle: typeof o.zelle === 'string' ? o.zelle : undefined,
    apple_cash: typeof o.apple_cash === 'string' ? o.apple_cash : undefined,
    cash_in_chair: o.cash_in_chair === false ? false : o.cash_in_chair === true ? true : undefined,
    note: typeof o.note === 'string' ? o.note : undefined,
  };
}
