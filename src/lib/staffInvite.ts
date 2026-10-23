/**
 * Staff invites when Clerk email invitations are disabled (phone-only instances).
 */
import { clerkCreateInvitation, clerkCreateUser, clerkListUsers } from './clerkClient';
import { sendEmail, isEmailSendConfigured } from './outbound';
import { escapeHtml } from './htmlEscape';

export function clerkInvitationsUnsupportedMessage(error?: string): boolean {
  const msg = String(error || '').toLowerCase();
  return (
    msg.includes('invitations are only supported on instances that accept email') ||
    msg.includes('invitations_not_supported')
  );
}

async function findClerkUserIdByEmail(email: string): Promise<string | null> {
  const listed = await clerkListUsers({ query: email, limit: 20 });
  if (!listed.ok || !listed.users) return null;
  const normalized = email.trim().toLowerCase();
  for (const user of listed.users) {
    const emails = (user.email_addresses || [])
      .map((e) => String(e.email_address || '').trim().toLowerCase())
      .filter(Boolean);
    if (emails.includes(normalized)) return String(user.id);
  }
  return null;
}

/** Create or resolve a Clerk user when /invitations is not allowed on this instance. */
export async function provisionStaffClerkUser(email: string): Promise<{
  ok: boolean;
  userId?: string;
  created?: boolean;
  error?: string;
}> {
  const existing = await findClerkUserIdByEmail(email);
  if (existing) return { ok: true, userId: existing, created: false };

  const created = await clerkCreateUser({
    email_address: [email],
    skip_password_requirement: true,
    public_metadata: { role: 'staff' },
  });
  if (created.ok && created.user?.id) {
    return { ok: true, userId: String(created.user.id), created: true };
  }

  const msg = created.error || '';
  if (/already exists|taken|duplicate/i.test(msg)) {
    const retry = await findClerkUserIdByEmail(email);
    if (retry) return { ok: true, userId: retry, created: false };
  }
  return { ok: false, error: msg || 'Could not create Clerk user' };
}

export async function sendStaffInviteNotice(opts: {
  to: string;
  companyName: string;
  loginUrl: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!isEmailSendConfigured()) return { ok: true, skipped: true };

  const company = escapeHtml(opts.companyName || 'your team');
  const login = escapeHtml(opts.loginUrl);
  const subject = `Admin access — ${opts.companyName || 'your team'}`;
  const text = [
    `You've been invited to the ${opts.companyName || 'team'} admin dashboard.`,
    '',
    `Sign in here: ${opts.loginUrl}`,
    '',
    'Use the same email address this message was sent to. If sign-in only shows phone, sign in with your phone then add this email to your account, or ask the install owner to turn on Email under Clerk → User & authentication.',
  ].join('\n');
  const html = `<p>You've been invited to the <strong>${company}</strong> admin dashboard.</p>
<p><a href="${login}">Sign in to admin</a></p>
<p style="color:#555;font-size:14px;">Use the same email address this message was sent to. If sign-in only offers phone, sign in with your phone and ensure this email is on your Clerk account, or ask the owner to enable <strong>Email</strong> under Clerk → User &amp; authentication.</p>`;

  const sent = await sendEmail({ to: opts.to, subject, text, html });
  if (!sent.ok) return { ok: false, error: sent.error };
  return { ok: true };
}

export type StaffInviteDelivery =
  | { kind: 'clerk_invitation'; invitationId: string | null }
  | { kind: 'provisioned_user'; userId: string; emailSent: boolean }
  | { kind: 'roster_only'; notice: string };

/** Clerk invitation, or provision + Resend when this instance rejects email invitations. */
export async function deliverStaffInvite(opts: {
  email: string;
  redirectUrl: string;
  companyName: string;
}): Promise<
  | { ok: true; delivery: StaffInviteDelivery; existingUserId?: string | null }
  | { ok: false; error: string }
> {
  const email = opts.email.trim().toLowerCase();
  const existingUserId = await findClerkUserIdByEmail(email);
  if (existingUserId) {
    return { ok: true, delivery: { kind: 'provisioned_user', userId: existingUserId, emailSent: false }, existingUserId };
  }

  const invited = await clerkCreateInvitation({
    email_address: email,
    redirect_url: opts.redirectUrl,
    public_metadata: { role: 'staff' },
    notify: true,
    ignore_existing: true,
  });
  if (invited.ok) {
    return {
      ok: true,
      delivery: { kind: 'clerk_invitation', invitationId: invited.invitation?.id || null },
      existingUserId: null,
    };
  }

  if (!clerkInvitationsUnsupportedMessage(invited.error)) {
    return { ok: false, error: invited.error || 'Could not send invitation' };
  }

  const provision = await provisionStaffClerkUser(email);
  if (provision.ok && provision.userId) {
    const mail = await sendStaffInviteNotice({
      to: email,
      companyName: opts.companyName,
      loginUrl: opts.redirectUrl.replace(/\/admin\/login\/?$/i, '/admin/login'),
    });
    return {
      ok: true,
      delivery: {
        kind: 'provisioned_user',
        userId: provision.userId,
        emailSent: mail.ok && !mail.skipped,
      },
      existingUserId: provision.userId,
    };
  }

  const notice =
    'Clerk email invitations are off for this install (phone-only sign-in). Turn on Email under Clerk → User & authentication, or add this person in the Clerk dashboard with this email, then have them sign in at /admin/login.';
  return {
    ok: true,
    delivery: { kind: 'roster_only', notice },
    existingUserId: null,
  };
}
