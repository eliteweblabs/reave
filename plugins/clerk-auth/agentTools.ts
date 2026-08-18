/**
 * Clerk Authentication agent tools.
 *
 * Clerk keys are per-app only. Platform / system-level tools
 * (clerk_list_apps, clerk_create_app, clerk_get_app_keys, clerk_delete_app)
 * always return that Clerk does not allow system-level access.
 *
 * Backend API tools (clerk_list_users, clerk_get_user, clerk_create_user,
 * clerk_update_user, clerk_delete_user, clerk_ban_user, clerk_unban_user,
 * clerk_list_sessions, clerk_revoke_session, clerk_list_organizations,
 * clerk_create_organization, clerk_get_instance_status) require CLERK_SECRET_KEY
 * for the current instance.
 */
import {
  isClerkConfigured,
  clerkListUsers,
  clerkGetUser,
  clerkCreateUser,
  clerkUpdateUser,
  clerkDeleteUser,
  clerkBanUser,
  clerkUnbanUser,
  clerkListSessions,
  clerkRevokeSession,
  clerkListOrganizations,
  clerkCreateOrganization,
  clerkGetInstanceStatus,
  type ClerkUser,
  type ClerkSession,
  type ClerkOrganization,
} from '../../src/lib/clerkClient';
import type { AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

const CLERK_NO_SYSTEM_ACCESS = 'Clerk does not allow system level access.';

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtUser(u: ClerkUser): string {
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || '(no name)';
  const email = u.email_addresses?.[0]?.email_address ?? '—';
  const phone = u.phone_numbers?.[0]?.phone_number ?? null;
  const lastSeen = u.last_sign_in_at
    ? new Date(u.last_sign_in_at).toLocaleDateString()
    : 'never';
  const lines = [`**${name}** (${u.id})`, `  Email: ${email}`];
  if (phone) lines.push(`  Phone: ${phone}`);
  lines.push(`  Last sign-in: ${lastSeen}${u.locked ? ' 🔒 BANNED' : ''}`);
  return lines.join('\n');
}

function fmtSession(s: ClerkSession): string {
  const exp = s.expire_at ? new Date(s.expire_at).toLocaleString() : 'no expiry';
  const last = s.last_active_at ? new Date(s.last_active_at).toLocaleString() : '—';
  return `${s.id} — user:${s.user_id} status:${s.status} last:${last} expires:${exp}`;
}

function fmtOrg(o: ClerkOrganization): string {
  return `**${o.name}** (${o.id}) slug:${o.slug} members:${o.members_count}`;
}

// ─── tool module ──────────────────────────────────────────────────────────────

export const clerkAuthModule: AgentToolModule = {
  id: 'clerk-auth',

  enabled(_ctx: ToolContext): boolean {
    return isClerkConfigured();
  },

  definitions(_ctx: ToolContext) {
    return [
      // ── System-level (always refuse — Pro does not provide a platform key) ─
      {
        type: 'function' as const,
        function: {
          name: 'clerk_list_apps',
          description:
            'Clerk does not allow system level access. Cannot list applications across the account — Clerk keys are per-app only.',
          parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'clerk_create_app',
          description:
            'Clerk does not allow system level access. Cannot provision a new Clerk application — keys are per-app only.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Application name, e.g. "Paulino Auto Group"' },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'clerk_get_app_keys',
          description:
            'Clerk does not allow system level access. Cannot fetch keys for another Clerk app — keys are per-app only.',
          parameters: {
            type: 'object',
            properties: {
              app_id: { type: 'string', description: 'Clerk application id, e.g. app_3Hm901...' },
            },
            required: ['app_id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'clerk_delete_app',
          description:
            'Clerk does not allow system level access. Cannot delete Clerk applications across the account — keys are per-app only.',
          parameters: {
            type: 'object',
            properties: {
              app_id: { type: 'string', description: 'Clerk application id' },
              confirmed: {
                type: 'boolean',
                description: 'Must be true after the user explicitly confirms deletion.',
              },
            },
            required: ['app_id', 'confirmed'],
            additionalProperties: false,
          },
        },
      },
      // ── Backend API — instance ────────────────────────────────────────────
      {
        type: 'function' as const,
        function: {
          name: 'clerk_get_instance_status',
          description:
            'Get the status and configuration of the current Clerk app instance (auth strategies, domains, plan info). Uses CLERK_SECRET_KEY.',
          parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
        },
      },
      // ── Backend API — users ───────────────────────────────────────────────
      {
        type: 'function' as const,
        function: {
          name: 'clerk_list_users',
          description:
            'List or search users in the current Clerk app. Uses CLERK_SECRET_KEY. Returns name, email, last sign-in, and ban status.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Optional search (email, name, phone)',
              },
              limit: {
                type: 'number',
                description: 'Max users to return (default 20, max 100)',
              },
              offset: {
                type: 'number',
                description: 'Pagination offset',
              },
              order_by: {
                type: 'string',
                description:
                  'Sort field. Options: created_at, -created_at, last_sign_in_at, -last_sign_in_at',
              },
            },
            required: [],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'clerk_get_user',
          description: 'Get a single Clerk user by their user id.',
          parameters: {
            type: 'object',
            properties: {
              user_id: { type: 'string', description: 'Clerk user id, e.g. user_abc123' },
            },
            required: ['user_id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'clerk_create_user',
          description:
            'Create a new user in the current Clerk app. Useful for seeding test accounts or provisioning client-side logins. Uses CLERK_SECRET_KEY.',
          parameters: {
            type: 'object',
            properties: {
              email_address: {
                type: 'string',
                description: 'Primary email address for the new user',
              },
              first_name: { type: 'string' },
              last_name: { type: 'string' },
              phone_number: {
                type: 'string',
                description: 'Optional phone number in E.164 format, e.g. +12125551234',
              },
              password: { type: 'string', description: 'Optional initial password' },
              skip_password_checks: {
                type: 'boolean',
                description: 'Skip password strength checks (default false)',
              },
            },
            required: [],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'clerk_update_user',
          description: 'Update a Clerk user\'s name or metadata by user id.',
          parameters: {
            type: 'object',
            properties: {
              user_id: { type: 'string', description: 'Clerk user id' },
              first_name: { type: 'string' },
              last_name: { type: 'string' },
              public_metadata: {
                type: 'object',
                additionalProperties: true,
                description: 'Key/value pairs stored in public metadata',
              },
            },
            required: ['user_id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'clerk_delete_user',
          description:
            'Permanently delete a user from the current Clerk app. Irreversible — confirm before calling.',
          parameters: {
            type: 'object',
            properties: {
              user_id: { type: 'string', description: 'Clerk user id' },
              confirmed: {
                type: 'boolean',
                description: 'Must be true after user explicitly confirms.',
              },
            },
            required: ['user_id', 'confirmed'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'clerk_ban_user',
          description:
            'Ban a user — blocks all future sign-ins immediately. User data is preserved.',
          parameters: {
            type: 'object',
            properties: {
              user_id: { type: 'string', description: 'Clerk user id' },
            },
            required: ['user_id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'clerk_unban_user',
          description: 'Lift a ban on a previously banned user, restoring their sign-in access.',
          parameters: {
            type: 'object',
            properties: {
              user_id: { type: 'string', description: 'Clerk user id' },
            },
            required: ['user_id'],
            additionalProperties: false,
          },
        },
      },
      // ── Backend API — sessions ────────────────────────────────────────────
      {
        type: 'function' as const,
        function: {
          name: 'clerk_list_sessions',
          description:
            'List active (or filtered) sessions in the current Clerk app. Useful for auditing who is logged in.',
          parameters: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Max sessions to return (default 20)' },
              status: {
                type: 'string',
                description: 'Filter by status: active, revoked, ended, expired, removed, abandoned',
              },
              user_id: {
                type: 'string',
                description: 'Filter sessions for one user',
              },
            },
            required: [],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'clerk_revoke_session',
          description:
            'Revoke a session by session id — signs that device/tab out immediately.',
          parameters: {
            type: 'object',
            properties: {
              session_id: { type: 'string', description: 'Clerk session id' },
            },
            required: ['session_id'],
            additionalProperties: false,
          },
        },
      },
      // ── Backend API — organizations ───────────────────────────────────────
      {
        type: 'function' as const,
        function: {
          name: 'clerk_list_organizations',
          description:
            'List organizations in the current Clerk app. Good for multi-tenant setups where each client org is a Clerk Organization.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Optional name search' },
              limit: { type: 'number', description: 'Max results (default 20)' },
            },
            required: [],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'clerk_create_organization',
          description:
            'Create a new organization in the current Clerk app. Use to onboard a client tenant in a multi-org setup.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Organization display name' },
              slug: {
                type: 'string',
                description: 'Optional URL slug — auto-generated from name if omitted',
              },
              created_by: {
                type: 'string',
                description: 'Optional Clerk user_id to set as the creator/admin',
              },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
      },
    ];
  },

  handlers: {
    // ── System-level (always refuse — Pro does not provide a platform key) ────

    async clerk_list_apps(_args, _ctx) {
      return JSON.stringify({ error: CLERK_NO_SYSTEM_ACCESS });
    },

    async clerk_create_app(_args, _ctx) {
      return JSON.stringify({ error: CLERK_NO_SYSTEM_ACCESS });
    },

    async clerk_get_app_keys(_args, _ctx) {
      return JSON.stringify({ error: CLERK_NO_SYSTEM_ACCESS });
    },

    async clerk_delete_app(_args, _ctx) {
      return JSON.stringify({ error: CLERK_NO_SYSTEM_ACCESS });
    },

    // ── Backend API — instance ────────────────────────────────────────────────

    async clerk_get_instance_status(_args, _ctx) {
      const r = await clerkGetInstanceStatus();
      if (!r.ok) return JSON.stringify({ error: r.error });
      const inst = r.instance ?? {};
      return JSON.stringify({
        ok: true,
        instance_id: inst.id,
        environment_type: inst.environment_type,
        auth_config: inst.auth_config,
        organization_settings: inst.organization_settings,
        clerk_js_version: inst.clerk_js_version,
      });
    },

    // ── Backend API — users ───────────────────────────────────────────────────

    async clerk_list_users(args, _ctx) {
      const r = await clerkListUsers({
        limit: args.limit ? Number(args.limit) : 20,
        offset: args.offset ? Number(args.offset) : undefined,
        query: args.query ? String(args.query) : undefined,
        order_by: args.order_by ? String(args.order_by) : '-created_at',
      });
      if (!r.ok) return JSON.stringify({ error: r.error });
      const users = r.users ?? [];
      if (!users.length) return JSON.stringify({ users: [], message: 'No users found.' });
      return JSON.stringify({
        total: r.total,
        users: users.map(fmtUser).join('\n\n'),
      });
    },

    async clerk_get_user(args, _ctx) {
      const userId = String(args.user_id ?? '').trim();
      if (!userId) return JSON.stringify({ error: 'user_id is required' });
      const r = await clerkGetUser(userId);
      if (!r.ok) return JSON.stringify({ error: r.error });
      return JSON.stringify({ user: fmtUser(r.user!) });
    },

    async clerk_create_user(args, _ctx) {
      const email = args.email_address ? String(args.email_address) : undefined;
      const phone = args.phone_number ? String(args.phone_number) : undefined;
      const r = await clerkCreateUser({
        email_address: email ? [email] : undefined,
        phone_number: phone ? [phone] : undefined,
        first_name: args.first_name ? String(args.first_name) : undefined,
        last_name: args.last_name ? String(args.last_name) : undefined,
        password: args.password ? String(args.password) : undefined,
        skip_password_checks: Boolean(args.skip_password_checks),
      });
      if (!r.ok) return JSON.stringify({ error: r.error });
      return JSON.stringify({ ok: true, user: fmtUser(r.user!) });
    },

    async clerk_update_user(args, _ctx) {
      const userId = String(args.user_id ?? '').trim();
      if (!userId) return JSON.stringify({ error: 'user_id is required' });
      const r = await clerkUpdateUser(userId, {
        first_name: args.first_name ? String(args.first_name) : undefined,
        last_name: args.last_name ? String(args.last_name) : undefined,
        public_metadata: args.public_metadata as Record<string, unknown> | undefined,
      });
      if (!r.ok) return JSON.stringify({ error: r.error });
      return JSON.stringify({ ok: true, user: fmtUser(r.user!) });
    },

    async clerk_delete_user(args, _ctx) {
      if (!args.confirmed) {
        return JSON.stringify({
          error: 'Deletion requires confirmed:true. This permanently removes the user.',
        });
      }
      const userId = String(args.user_id ?? '').trim();
      if (!userId) return JSON.stringify({ error: 'user_id is required' });
      const r = await clerkDeleteUser(userId);
      if (!r.ok) return JSON.stringify({ error: r.error });
      return JSON.stringify({ ok: true, deleted: userId });
    },

    async clerk_ban_user(args, _ctx) {
      const userId = String(args.user_id ?? '').trim();
      if (!userId) return JSON.stringify({ error: 'user_id is required' });
      const r = await clerkBanUser(userId);
      if (!r.ok) return JSON.stringify({ error: r.error });
      return JSON.stringify({ ok: true, banned: userId });
    },

    async clerk_unban_user(args, _ctx) {
      const userId = String(args.user_id ?? '').trim();
      if (!userId) return JSON.stringify({ error: 'user_id is required' });
      const r = await clerkUnbanUser(userId);
      if (!r.ok) return JSON.stringify({ error: r.error });
      return JSON.stringify({ ok: true, unbanned: userId });
    },

    // ── Backend API — sessions ────────────────────────────────────────────────

    async clerk_list_sessions(args, _ctx) {
      const r = await clerkListSessions({
        limit: args.limit ? Number(args.limit) : 20,
        status: args.status ? String(args.status) : 'active',
        user_id: args.user_id ? String(args.user_id) : undefined,
      });
      if (!r.ok) return JSON.stringify({ error: r.error });
      const sessions = r.sessions ?? [];
      if (!sessions.length) return JSON.stringify({ sessions: [], message: 'No sessions found.' });
      return JSON.stringify({
        count: sessions.length,
        sessions: sessions.map(fmtSession).join('\n'),
      });
    },

    async clerk_revoke_session(args, _ctx) {
      const sessionId = String(args.session_id ?? '').trim();
      if (!sessionId) return JSON.stringify({ error: 'session_id is required' });
      const r = await clerkRevokeSession(sessionId);
      if (!r.ok) return JSON.stringify({ error: r.error });
      return JSON.stringify({ ok: true, revoked: sessionId });
    },

    // ── Backend API — organizations ───────────────────────────────────────────

    async clerk_list_organizations(args, _ctx) {
      const r = await clerkListOrganizations({
        limit: args.limit ? Number(args.limit) : 20,
        query: args.query ? String(args.query) : undefined,
      });
      if (!r.ok) return JSON.stringify({ error: r.error });
      const orgs = r.organizations ?? [];
      if (!orgs.length)
        return JSON.stringify({ organizations: [], message: 'No organizations found.' });
      return JSON.stringify({
        total: r.total ?? orgs.length,
        organizations: orgs.map(fmtOrg).join('\n'),
      });
    },

    async clerk_create_organization(args, _ctx) {
      const name = String(args.name ?? '').trim();
      if (!name) return JSON.stringify({ error: 'name is required' });
      const r = await clerkCreateOrganization({
        name,
        slug: args.slug ? String(args.slug) : undefined,
        created_by: args.created_by ? String(args.created_by) : undefined,
      });
      if (!r.ok) return JSON.stringify({ error: r.error });
      return JSON.stringify({ ok: true, organization: fmtOrg(r.organization!) });
    },
  },
};
