export type CodeViolation = {
  id: string;
  category: string;
  description: string;
  status: 'open' | 'resolved' | 'unknown';
  issuedAt?: string | null;
  source: string;
};

export type ViolationLookupResult =
  | { ok: true; violations: CodeViolation[]; source: string }
  | { ok: false; error: string; code?: string };

export interface ViolationsProvider {
  id: string;
  configured: () => boolean;
  lookup: (input: { address: string; city?: string; state?: string; zip?: string }) => Promise<ViolationLookupResult>;
}
