/**
 * Owner team management — invite / list / revoke staff.
 * GET  /api/admin/team
 * POST /api/admin/team  { email }
 */
import type { APIContext } from 'astro';
import { jsonResponse } from '../../../../lib/apiResponse';
import {
  clerkCreateInvitation,
  clerkListUsers,
} from '../../../../lib/clerkClient';
import { requireDeploymentOwner } from '../../../../lib/deploymentOwner';
import { requestOrigin } from '../../../../lib/requestOrigin';
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
  return jsonResponse({
    ok: true,
    members: members.map((m) => ({
      id: m.id,
      email: m.email,
      userId: m.userId,
      status: m.status,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
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

  // If they already have a Clerk user on this install, activate immediately.
  let existingUserId: string | null = null;
  const listed = await clerkListUsers({ query: email, limit: 20 });
  if (listed.ok && listed.users) {
    for (const user of listed.users) {
      const emails = (user.email_addresses || [])
        .map((e) => String(e.email_address || '').trim().toLowerCase())
        .filter(Boolean);
      if (emails.includes(email)) {
        existingUserId = String(user.id);
        break;
      }
    }
  }

  let invitationId: string | null = null;
  if (!existingUserId) {
    const invited = await clerkCreateInvitation({
      email_address: email,
      redirect_url: inviteRedirectUrl(context.request),
      public_metadata: { role: 'staff' },
      notify: true,
      ignore_existing: true,
    });
    if (!invited.ok) {
      return jsonResponse(
        { ok: false, error: invited.error || 'Could not send invitation' },
        400,
      );
    }
    invitationId = invited.invitation?.id || null;
  }

  const member = await upsertStaffInvite({
    email,
    invitedBy: auth.userId,
    invitationId,
    userId: existingUserId,
  });

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
    invited: !existingUserId,
  }, existingUserId ? 200 : 201);
}
