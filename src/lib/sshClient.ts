/**
 * SSH command execution client for the admin agent.
 *
 * Used primarily for running WP-CLI commands against Kinsta WordPress
 * environments. Credentials are pulled from Railway environment variables:
 *
 *   KINSTA_SSH_HOST        — SSH hostname (e.g. 12.34.56.78 or ssh.kinsta.com)
 *   KINSTA_SSH_PORT        — SSH port (default 22)
 *   KINSTA_SSH_USER        — SSH username (provided by Kinsta per environment)
 *   KINSTA_SSH_PRIVATE_KEY — PEM-encoded private key (RSA/Ed25519)
 *
 * Per-site overrides can be passed explicitly from the agent tool when
 * connecting to a site-specific SSH endpoint.
 *
 * Security notes:
 *  - The private key is NEVER echoed back to the chat. The agent tool strips it
 *    from all log output and error messages.
 *  - Commands are passed as-is to the remote shell. The agent prompt instructs
 *    the model to use this only for WP-CLI / safe read/write operations.
 *  - 30 s execution timeout; stdout/stderr capped at 32 KB each.
 */
import { Client } from 'ssh2';
import { serverEnv } from './serverEnv';

export interface SshCredentials {
  host: string;
  port: number;
  username: string;
  /** PEM-encoded private key */
  privateKey: string;
}

export interface SshResult {
  ok: true;
  stdout: string;
  stderr: string;
  exit_code: number;
}

export interface SshError {
  ok: false;
  error: string;
}

const MAX_BYTES = 32 * 1024;
const EXEC_TIMEOUT_MS = 30_000;

/** Resolve SSH credentials from env vars (+ optional overrides). */
export function resolveSshCredentials(overrides?: Partial<SshCredentials>): SshCredentials | null {
  const host = overrides?.host || serverEnv('KINSTA_SSH_HOST')?.trim() || '';
  const port = overrides?.port || Number(serverEnv('KINSTA_SSH_PORT')?.trim() || '22') || 22;
  const username = overrides?.username || serverEnv('KINSTA_SSH_USER')?.trim() || '';
  const privateKey = overrides?.privateKey || serverEnv('KINSTA_SSH_PRIVATE_KEY')?.trim() || '';

  if (!host || !username || !privateKey) return null;

  return { host, port, username, privateKey };
}

export function isSshConfigured(): boolean {
  return resolveSshCredentials() !== null;
}

/**
 * Execute a single command over SSH and return stdout/stderr.
 * Resolves when the command exits or the timeout fires.
 */
export async function execSsh(
  command: string,
  credentialsOrOverrides?: SshCredentials | Partial<SshCredentials>,
): Promise<SshResult | SshError> {
  const creds =
    credentialsOrOverrides && 'host' in credentialsOrOverrides && credentialsOrOverrides.privateKey
      ? (credentialsOrOverrides as SshCredentials)
      : resolveSshCredentials(credentialsOrOverrides as Partial<SshCredentials> | undefined);

  if (!creds) {
    return {
      ok: false,
      error:
        'SSH credentials not configured. Set KINSTA_SSH_HOST, KINSTA_SSH_USER, and KINSTA_SSH_PRIVATE_KEY in Railway Variables.',
    };
  }

  return new Promise<SshResult | SshError>((resolve) => {
    const conn = new Client();
    let settled = false;
    let stdoutBuf = '';
    let stderrBuf = '';

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      conn.end();
      resolve({ ok: false, error: `SSH command timed out after ${EXEC_TIMEOUT_MS / 1000}s` });
    }, EXEC_TIMEOUT_MS);

    const finish = (result: SshResult | SshError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          finish({ ok: false, error: `exec error: ${err.message}` });
          return;
        }

        stream.on('close', (code: number) => {
          conn.end();
          finish({
            ok: true,
            stdout: stdoutBuf.slice(0, MAX_BYTES),
            stderr: stderrBuf.slice(0, MAX_BYTES),
            exit_code: code ?? 0,
          });
        });

        stream.on('data', (chunk: Buffer | string) => {
          stdoutBuf += chunk.toString();
        });

        stream.stderr.on('data', (chunk: Buffer | string) => {
          stderrBuf += chunk.toString();
        });
      });
    });

    conn.on('error', (err: Error) => {
      finish({ ok: false, error: `SSH connection error: ${err.message}` });
    });

    conn.connect({
      host: creds.host,
      port: creds.port,
      username: creds.username,
      privateKey: creds.privateKey,
      readyTimeout: 10_000,
    });
  });
}
