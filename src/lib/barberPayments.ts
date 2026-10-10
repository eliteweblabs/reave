/** Barber install payment mode — default fast deploy is P2P (no Stripe on Cal). */
export type BarberPaymentMode = 'p2p' | 'stripe';

export type BarberPaymentsConfig = {
  mode?: BarberPaymentMode;
  venmo?: string;
  cashapp?: string;
  zelle?: string;
  /** Phone or email for Apple Cash / iMessage pay. */
  apple_cash?: string;
  cash_in_chair?: boolean;
  note?: string;
};

export function barberPaymentMode(cfg: { payments?: BarberPaymentsConfig }): BarberPaymentMode {
  return cfg.payments?.mode === 'stripe' ? 'stripe' : 'p2p';
}

export function normalizeVenmoHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '');
}

export function normalizeCashAppHandle(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  return t.startsWith('$') ? t : `$${t.replace(/^\$+/, '')}`;
}

export type P2PPayLink = {
  id: 'venmo' | 'cashapp' | 'zelle' | 'apple_cash' | 'cash';
  label: string;
  href?: string;
  copyText?: string;
  simpleIcon?: string;
};

/** Build deep links for confirm step (amount in whole USD). */
export function barberP2PPayLinks(
  cfg: BarberPaymentsConfig,
  amountDollars: number,
  note: string,
): P2PPayLink[] {
  const out: P2PPayLink[] = [];
  const amount =
    Number.isFinite(amountDollars) && amountDollars > 0 ? amountDollars.toFixed(2) : '';
  const noteEnc = encodeURIComponent(note.slice(0, 200));

  const venmo = cfg.venmo ? normalizeVenmoHandle(cfg.venmo) : '';
  if (venmo && amount) {
    const q = `recipients=${encodeURIComponent(venmo)}&amount=${encodeURIComponent(amount)}&note=${noteEnc}`;
    out.push({
      id: 'venmo',
      label: 'Venmo',
      href: `https://venmo.com/?${q}`,
      simpleIcon: 'venmo',
    });
  }

  const cashapp = cfg.cashapp ? normalizeCashAppHandle(cfg.cashapp) : '';
  if (cashapp && amount) {
    const handle = cashapp.replace(/^\$/, '');
    out.push({
      id: 'cashapp',
      label: 'Cash App',
      href: `https://cash.app/$${encodeURIComponent(handle)}/${amount}`,
      simpleIcon: 'cashapp',
    });
  }

  const zelle = cfg.zelle?.trim();
  if (zelle) {
    out.push({
      id: 'zelle',
      label: 'Zelle',
      copyText: zelle,
      simpleIcon: 'zelle',
    });
  }

  const apple = cfg.apple_cash?.trim();
  if (apple) {
    out.push({
      id: 'apple_cash',
      label: 'Apple Cash',
      copyText: apple,
      simpleIcon: 'applepay',
    });
  }

  if (cfg.cash_in_chair !== false) {
    out.push({
      id: 'cash',
      label: 'Pay in chair',
      simpleIcon: 'banknote',
    });
  }

  return out;
}

/** Marketing homepage — always show all methods (Simple Icons slugs). */
export const BARBER_PAY_WAY_DISPLAY = [
  { label: 'Venmo', simpleIcon: 'venmo' },
  { label: 'Cash App', simpleIcon: 'cashapp' },
  { label: 'Zelle', simpleIcon: 'zelle' },
  { label: 'Apple Cash', simpleIcon: 'applepay' },
  { label: 'Cash in chair', kind: 'banknote' as const },
];

/** Railway / Astro public env keys for barber site repos. */
export function barberPaymentsToSiteEnv(payments: BarberPaymentsConfig | undefined): Record<string, string> {
  const mode = barberPaymentMode({ payments });
  const p = payments ?? {};
  const env: Record<string, string> = {
    PUBLIC_PAYMENT_MODE: mode,
  };
  if (p.venmo?.trim()) env.PUBLIC_P2P_VENMO = p.venmo.trim();
  if (p.cashapp?.trim()) env.PUBLIC_P2P_CASHAPP = p.cashapp.trim();
  if (p.zelle?.trim()) env.PUBLIC_P2P_ZELLE = p.zelle.trim();
  if (p.apple_cash?.trim()) env.PUBLIC_P2P_APPLE_CASH = p.apple_cash.trim();
  if (p.note?.trim()) env.PUBLIC_P2P_NOTE = p.note.trim();
  if (p.cash_in_chair === false) env.PUBLIC_P2P_CASH_IN_CHAIR = 'false';
  return env;
}
