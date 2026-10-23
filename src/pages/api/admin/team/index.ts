/**
 * Owner team management — invite / list / revoke staff.
 * GET  /api/admin/team
 * POST /api/admin/team  { email }
 */
import type { APIContext } from 'astro';
import { jsonResponse } from '../../../../lib/apiResponse';
import { requireDeploymentOwner } from '../../../../lib/deploymentOwner';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import { requestOrigin } from '../../../../lib/requestOrigin';
import { deliverStaffInvite } from '../../../../lib/staffInvite';
import { cardPathForUserId } from '../../../../lib/cardSubject';
import { agentAlertUserId } from '../../../../lib/adminAgentAlert';
import {
  listStaffMembers,
  upsertStaffInvite,
} from '../../../../lib/staffMembers';

export const prerender = false;

function inviteRedirectUrl(request: Request): string {
  try {
    return `${requestOrigin(request).replace(/\/+$/, '')}/admin/login`;
  } catch {
    return `${new URL(request.url).origin}/admin/login`;
  }
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const members = await listStaffMembers({ includeRevoked: false });
  const ownerUserId = agentAlertUserId() || null;
  return jsonResponse({
    ok: true,
    primaryCardPath: '/card',
    ownerUserId,
    ownerCardPath: '/card',
    members: members.map((m) => ({
      id: m.id,
      email: m.email,
      userId: m.userId,
      status: m.status,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      cardPath:
        m.status === 'active' && m.userId ? cardPathForUserId(m.userId) : null,
    })),
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const email = String(body.email ?? '')
    .trim()
    .toLowerCase();
  if (!email || !email.includes('@')) {
    return jsonResponse({ ok: false, error: 'Valid email required' }, 400);
  }

  const company = await getCompanyConfig(context.request);
  const delivered = await deliverStaffInvite({
    email,
    redirectUrl: inviteRedirectUrl(context.request),
    companyName: company.name,
  });
  if (!delivered.ok) {
    return jsonResponse({ ok: false, error: delivered.error }, 400);
  }

  const delivery = delivered.delivery;
  let invitationId: string | null = null;
  let existingUserId: string | null = delivered.existingUserId ?? null;

  if (delivery.kind === 'clerk_invitation') {
    invitationId = delivery.invitationId;
  } else if (delivery.kind === 'provisioned_user') {
    existingUserId = delivery.userId;
  }

  const member = await upsertStaffInvite({
    email,
    invitedBy: auth.userId,
    invitationId,
    userId: existingUserId,
  });

  let message: string | undefined;
  if (delivery.kind === 'provisioned_user') {
    message = delivery.emailSent
      ? `Added ${email} and sent a sign-in link by email.`
      : `Added ${email} in Clerk. Have them sign in at /admin/login (enable RESEND_FROM to email them automatically).`;
  } else if (delivery.kind === 'roster_only') {
    message = delivery.notice;
  }

  return jsonResponse({
    ok: true,
    member: {
      id: member.id,
      email: member.email,
      userId: member.userId,
      status: member.status,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    },
    invited: delivery.kind === 'clerk_invitation',
    delivery: delivery.kind,
    message,
  }, existingUserId && delivery.kind !== 'clerk_invitation' ? 200 : 201);
}
