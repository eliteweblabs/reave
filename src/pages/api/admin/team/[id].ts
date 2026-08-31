/**
 * DELETE /api/admin/team/:id — revoke staff access.
 */
import type { APIContext } from 'astro';
import { jsonResponse } from '../../../../lib/apiResponse';
import { clerkRevokeInvitation } from '../../../../lib/clerkClient';
import { requireDeploymentOwner } from '../../../../lib/deploymentOwner';
import { getStaffByEmail, listStaffMembers, revokeStaffMember } from '../../../../lib/staffMembers';

export const prerender = false;

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
