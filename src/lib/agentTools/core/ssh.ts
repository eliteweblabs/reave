/**
 * Agent tool module: exec_ssh
 *
 * Executes a command on a remote server over SSH. Primarily used for:
 *  - Running WP-CLI commands on Kinsta-hosted WordPress sites
 *    (e.g. fix noindex, install plugins, flush cache, update options)
 *  - Any server-side task that requires shell access
 *
 * Credentials default to KINSTA_SSH_* env vars but can be overridden
 * per-call when managing multiple sites with different SSH endpoints.
 *
 * The private key is NEVER echoed back — it is redacted from all output.
 */

import { execSsh, isSshConfigured } from '../../sshClient';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../types';

async function handle_exec_ssh(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  const command = String(args.command ?? '').trim();
  if (!command) return JSON.stringify({ error: 'command is required' });

  // Optional per-call credential overrides (e.g. for multi-site setups)
  const host = args.host ? String(args.host).trim() : undefined;
  const port = args.port ? Number(args.port) : undefined;
  const username = args.username ? String(args.username).trim() : undefined;
  const privateKey = args.private_key ? String(args.private_key).trim() : undefined;

  const overrides = host || port || username || privateKey
    ? { host, port, username, privateKey }
    : undefined;

  const result = await execSsh(command, overrides);

  if (!result.ok) {
    return JSON.stringify({ ok: false, error: result.error });
  }

  return JSON.stringify({
    ok: true,
    command,
    exit_code: result.exit_code,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}

const definition: AgentToolDef = {
  type: 'function',
  function: {
    name: 'exec_ssh',
    description:
      'Execute a shell command on a remote server over SSH. Use for WP-CLI commands on Kinsta WordPress sites (e.g. fix noindex with "wp option update blog_public 1", install/activate plugins with "wp plugin install yoast-seo --activate", flush cache, update options). Defaults to KINSTA_SSH_HOST/USER/PRIVATE_KEY env vars. Override host/port/username/private_key for a different server. The private key is never echoed back.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description:
            'Shell command to execute on the remote server, e.g. "wp option update blog_public 1" or "wp plugin list"',
        },
        host: {
          type: 'string',
          description:
            'Optional SSH hostname override. Defaults to KINSTA_SSH_HOST env var.',
        },
        port: {
          type: 'number',
          description: 'Optional SSH port override (default 22).',
        },
        username: {
          type: 'string',
          description:
            'Optional SSH username override. Defaults to KINSTA_SSH_USER env var.',
        },
        private_key: {
          type: 'string',
          description:
            'Optional PEM-encoded private key override. Defaults to KINSTA_SSH_PRIVATE_KEY env var. Never echoed back in output.',
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
};

export const sshModule: AgentToolModule = {
  id: 'ssh',
  enabled: (_ctx: ToolContext) => isSshConfigured(),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [definition];
  },
  handlers: {
    exec_ssh: handle_exec_ssh,
  },
};
