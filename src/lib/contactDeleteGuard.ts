/**
 * Pre-delete checks: linked projects (jobs) and Crater invoices.
 */

import { deleteContact, getContact } from './contactApi';
import { isCraterConfigured, craterGetClientBilling } from './craterClient';
import { storeDeleteWork, storeListWork } from './workStore';

export type LinkedProject = { slug: string; title: string };

export type ContactDeleteBlockers = {
  name: string;
  /** @deprecated use project_count — kept for API compat */
  job_count: number;
  project_count: number;
  invoice_count: number;
  projects: LinkedProject[];
};

export function projectDeleteWarning(name: string, blockers: ContactDeleteBlockers): string | null {
  if (blockers.project_count <= 0) return null;
  const titles = blockers.projects
    .slice(0, 6)
    .map((p) => p.title)
    .join(', ');
  const extra =
    blockers.project_count > 6 ? ` (+${blockers.project_count - 6} more)` : '';
  return `"${name}" has ${blockers.project_count} attached project(s)${titles ? `: ${titles}${extra}` : ''}. Deleting this client will permanently delete all attached projects.`;
}

export async function getContactDeleteBlockers(
  uid: string,
): Promise<{ ok: true; data: ContactDeleteBlockers } | { ok: false; error: string }> {
  const trimmed = uid.trim();
  if (!trimmed) return { ok: false, error: 'uid is required' };

  const contact = await getContact(trimmed);
  if (!contact.ok) return { ok: false, error: contact.error };

  const jobs = await storeListWork({ contact_uid: trimmed });
  const projects: LinkedProject[] = (jobs ?? []).map((j) => ({ slug: j.slug, title: j.title }));
  const project_count = projects.length;

  let invoice_count = 0;
  if (isCraterConfigured()) {
    const billing = await craterGetClientBilling({
      email: contact.data.email ?? undefined,
      name: contact.data.name,
    });
    if (billing.ok && billing.data) {
      invoice_count = billing.data.outstanding.length + billing.data.previous.length;
    }
  }

  return {
    ok: true,
    data: {
      name: contact.data.name,
      job_count: project_count,
      project_count,
      invoice_count,
      projects,
    },
  };
}

export async function executeContactDelete(
  uid: string,
  opts: { force?: boolean; permanent?: boolean },
): Promise<
  | {
      ok: true;
      contact_name: string;
      deleted_projects: number;
      already_archived?: boolean;
      permanent?: boolean;
    }
  | { ok: false; error: string; status?: number; blockers?: ContactDeleteBlockers }
> {
  const trimmed = uid.trim();
  const blockers = await getContactDeleteBlockers(trimmed);
  if (!blockers.ok) return { ok: false, error: blockers.error, status: 404 };

  const { project_count, invoice_count, projects, name } = blockers.data;
  const needsConfirm = project_count > 0 || invoice_count > 0;

  if (needsConfirm && !opts.force) {
    const projectWarn = projectDeleteWarning(name, blockers.data);
    const error =
      projectWarn ??
      `"${name}" has ${invoice_count} linked invoice(s) in Crater. Confirm delete to remove the client anyway.`;
    return { ok: false, error, status: 409, blockers: blockers.data };
  }

  let deleted_projects = 0;
  for (const project of projects) {
    if (await storeDeleteWork(project.slug)) deleted_projects++;
  }

  const permanent = opts.permanent ?? !!opts.force;
  const result = await deleteContact(trimmed, { permanent });
  if (!result.ok) return { ok: false, error: result.error, status: result.status };

  return {
    ok: true,
    contact_name: name,
    deleted_projects,
    already_archived: result.already_archived,
    permanent,
  };
}

export function blockersToJson(blockers: ContactDeleteBlockers, contact_name?: string) {
  const warning = projectDeleteWarning(blockers.name, blockers);
  return {
    contact_name: contact_name ?? blockers.name,
    job_count: blockers.project_count,
    project_count: blockers.project_count,
    invoice_count: blockers.invoice_count,
    projects: blockers.projects,
    warning,
  };
}
