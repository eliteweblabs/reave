/**
 * PATCH /api/admin/team/:id — update staff roster settings.
 * DELETE /api/admin/team/:id — revoke staff access.
 */
import type { APIContext } from 'astro';
import { jsonResponse } from '../../../../lib/apiResponse';
import { clerkRevokeInvitation } from '../../../../lib/clerkClient';
import { requireDeploymentOwner } from '../../../../lib/deploymentOwner';
import { cardPathForStaffMember } from '../../../../lib/cardSubject';
import {
  getStaffByEmail,
  listStaffMembers,
  revokeStaffMember,
  updateStaffMember,
} from '../../../../lib/staffMembers';

export const prerender = false;

function memberPayload(member: Awaited<ReturnType<typeof updateStaffMember>>) {
  if (!member) return null;
  return {
    id: member.id,
    email: member.email,
    userId: member.userId,
    status: member.status,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
    firstName: member.firstName,
    lastName: member.lastName,
    cardPath: cardPathForStaffMember(member),
    cardIncludePhone: member.cardIncludePhone !== false,
  };
}

export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const id = context.params.id?.trim() || '';
  if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400);

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const cardIncludePhone =
    'cardIncludePhone' in body || 'card_include_phone' in body
      ? body.cardIncludePhone !== false && body.card_include_phone !== false
      : undefined;
  if (cardIncludePhone === undefined) {
    return jsonResponse({ ok: false, error: 'Nothing to update' }, 400);
  }

  const member = await updateStaffMember(id, { cardIncludePhone });
  if (!member) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  return jsonResponse({ ok: true, member: memberPayload(member) });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const id = context.params.id?.trim() || '';
  if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400);

  const before = (await listStaffMembers({ includeRevoked: true })).find((m) => m.id === id);
  const member = await revokeStaffMember(id);
  if (!member) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  if (before?.invitationId && before.status === 'invited') {
    void clerkRevokeInvitation(before.invitationId);
  }

  // Touch lookup so caches stay coherent when email was the only key.
  if (before?.email) void getStaffByEmail(before.email);

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
  });
}
