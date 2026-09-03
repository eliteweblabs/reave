import {
  galeneCreateGroup,
  galeneCreateInvite,
  galeneListGroups,
  galeneRoomUrl,
  isGaleneConfigured,
} from '../../src/lib/galeneClient';
import { hasFeature } from '../../src/lib/features';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

async function handle_list_meeting_rooms(_args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('video_meet')) {
    return JSON.stringify({ error: 'video_meet not enabled in install config features' });
  }
  if (!isGaleneConfigured()) {
    return JSON.stringify({ error: 'GALENE_API_BASE_URL / GALENE_ADMIN_PASSWORD is not configured' });
  }
  const result = await galeneListGroups();
  if (!result.ok) return JSON.stringify({ error: result.error });
  const groups = result.data ?? [];
  const rooms = groups.map((name) => ({
    name,
    url: galeneRoomUrl(name),
  }));
  return JSON.stringify({ ok: true, rooms });
}

async function handle_create_meeting_room(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('video_meet')) {
    return JSON.stringify({ error: 'video_meet not enabled in install config features' });
  }
  if (!isGaleneConfigured()) {
    return JSON.stringify({ error: 'GALENE_API_BASE_URL / GALENE_ADMIN_PASSWORD is not configured' });
  }
  const name = String(args.name ?? 'meet').trim();
  const displayName = args.display_name != null ? String(args.display_name).trim() : undefined;
  const result = await galeneCreateGroup(name, {
    displayName: displayName || undefined,
    description: args.description != null ? String(args.description).trim() : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    group: result.data.group,
    url: result.data.url,
    moderator: { username: 'host', password: 'see GALENE_GROUP_PASSWORD on Galene service' },
  });
}

async function handle_create_meeting_invite(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('video_meet')) {
    return JSON.stringify({ error: 'video_meet not enabled in install config features' });
  }
  if (!isGaleneConfigured()) {
    return JSON.stringify({ error: 'GALENE_API_BASE_URL / GALENE_ADMIN_PASSWORD is not configured' });
  }
  const group = String(args.group ?? 'meet').trim();
  const username = args.username != null ? String(args.username).trim() : undefined;
  const expiresInDays =
    args.expires_in_days != null ? Number(args.expires_in_days) : undefined;
  const result = await galeneCreateInvite({
    group,
    username: username || undefined,
    expiresInDays: Number.isFinite(expiresInDays) ? expiresInDays : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ok: true, invite: result.data });
}

export const meetModule: AgentToolModule = {
  id: 'meet',
  enabled: () => hasFeature('video_meet') && isGaleneConfigured(),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'list_meeting_rooms',
          description:
            'List Galene video meeting rooms on meet.{domain}. Requires video_meet feature and GALENE_API_* env.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_meeting_room',
          description:
            'Create a new Galene video room. Moderator login is host + GALENE_GROUP_PASSWORD. Guests use any name/password.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Room slug (default meet)' },
              display_name: { type: 'string', description: 'Human title shown in Galene' },
              description: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_meeting_invite',
          description:
            'Generate a one-click Galene invite link (stateful token). Default room is meet; optional username locks the invite.',
          parameters: {
            type: 'object',
            properties: {
              group: { type: 'string', description: 'Room slug (default meet)' },
              username: { type: 'string', description: 'Optional fixed guest username' },
              expires_in_days: { type: 'number', description: 'Token lifetime in days (default 7)' },
            },
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    list_meeting_rooms: handle_list_meeting_rooms,
    create_meeting_room: handle_create_meeting_room,
    create_meeting_invite: handle_create_meeting_invite,
  },
};
