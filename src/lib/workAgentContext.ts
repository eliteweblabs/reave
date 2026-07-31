import type { WorkJobDoc, WorkJobSummary } from './workStore';
import { PROJECT_WAIT_INSTRUCTION } from './chatMessageFormat';

/** Max body chars injected into agent prompts (full notes stay in DB / read_work). */
export const MAX_AGENT_WORK_BODY = 14_000;

const WORK_STATUS_LABELS: Record<string, string> = {
  inquiry: 'Inquiry',
  active: 'Active',
  archived: 'Archived',
};

function truncateForAgent(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated at ${max} chars — use read_work for full content]`;
}

function workStatusLabel(status: string | undefined): string {
  if (!status) return '';
  return WORK_STATUS_LABELS[status] ?? status;
}

/** Short reference shown in chat — title, slug, client, status only. */
export function formatWorkChatReference(
  job: Pick<WorkJobSummary, 'title' | 'slug' | 'client' | 'contact_name' | 'status'>,
): string {
  const lines = [`Title: ${job.title}`, `Slug: ${job.slug}`];
  const client = job.contact_name || job.client;
  if (client) lines.push(`Client: ${client}`);
  const status = workStatusLabel(job.status);
  if (status) lines.push(`Status: ${status}`);
  return lines.join('\n');
}

/** User-visible stub when opening agent from the Work tab (full notes stay in system context). */
export function buildProjectOpenPrompt(
  job: Pick<WorkJobSummary, 'title' | 'slug' | 'client' | 'contact_name' | 'status'>,
): string {
  return `${formatWorkChatReference(job)}\n\n${PROJECT_WAIT_INSTRUCTION}`;
}

/** Lean project context for the agent — metadata + trimmed notes, not for user-facing recap. */
export function formatWorkForAgent(doc: WorkJobDoc, maxBody = MAX_AGENT_WORK_BODY): string {
  const lines = [
    `Slug: ${doc.slug}`,
    `Title: ${doc.title}`,
  ];
  const client = doc.contact_name || doc.client;
  if (client) lines.push(`Client: ${client}`);
  const status = workStatusLabel(doc.status);
  if (status) lines.push(`Status: ${status}`);
  if (doc.priority) lines.push(`Priority: ${doc.priority}`);
  if (doc.due_date) lines.push(`Due: ${doc.due_date}`);
  if (doc.value != null) lines.push(`Value: ${doc.value}`);
  if (doc.tags?.length) lines.push(`Tags: ${doc.tags.join(', ')}`);
  if (doc.source) lines.push(`Source: ${doc.source}`);
  const body = doc.body?.trim() || doc.content?.trim() || '';
  if (body) {
    lines.push('', 'Notes:', truncateForAgent(body, maxBody));
  } else {
    lines.push('', 'Notes: (empty)');
  }
  return lines.join('\n');
}
