const GIT_PUSH_RE = /\bgit\s+push\b/i;

function splitOnChains(command: string): string[] {
  return command
    .split(/\s*(?:&&|;)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Split a compound shell command so git push can run after the turn ends. */
export function splitGitPushCommand(
  command: string,
): { runNow: string; pushCommands: string[] } | null {
  const cmd = command.trim();
  if (!cmd || !GIT_PUSH_RE.test(cmd)) return null;

  const parts = splitOnChains(cmd);
  const pushIdx = parts.findIndex((p) => GIT_PUSH_RE.test(p));
  if (pushIdx === -1) return null;

  const runNow = parts.slice(0, pushIdx).join(' && ');
  const pushCommands = parts.slice(pushIdx).filter((p) => GIT_PUSH_RE.test(p));
  if (!pushCommands.length) return null;

  return { runNow, pushCommands };
}
