/**
 * Import inbound email attachments (via Resend Receiving API) into a project's file repository.
 */

import { Resend } from 'resend';
import {
  isAllowedProjectFileMediaType,
  normalizeEmailAttachmentMediaType,
  type ProjectFileSummary,
  storeAddProjectFile,
  storeListProjectFiles,
} from './projectFiles';
import { serverEnv } from './serverEnv';
import { isSafeWorkSlug } from './workStore';

export interface EmailAttachmentImportResult {
  imported: ProjectFileSummary[];
  skipped: number;
  errors: string[];
}

function emailAttachmentSourceRef(emailId: string, attachmentId: string): string {
  return `${emailId.trim()}:${attachmentId.trim()}`;
}

function getResendClient(): Resend | null {
  const apiKey = serverEnv('RESEND_API_KEY')?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

type ResendInboundAttachment = {
  id?: string;
  filename?: string;
  content_type?: string;
  contentType?: string;
  download_url?: string;
  downloadUrl?: string;
  size?: number;
};

function attachmentDownloadUrl(att: ResendInboundAttachment): string {
  return String(att.download_url ?? att.downloadUrl ?? '').trim();
}

function attachmentContentType(att: ResendInboundAttachment): string {
  return String(att.content_type ?? att.contentType ?? '').trim();
}

async function listResendAttachments(
  resend: Resend,
  resendEmailId: string,
): Promise<ResendInboundAttachment[]> {
  const { data, error } = await resend.emails.receiving.attachments.list({
    emailId: resendEmailId,
  });
  if (error) {
    console.warn('[email-attachments] list failed', { resendEmailId, error: error.message });
    return [];
  }
  return data?.data ?? [];
}

async function getResendAttachmentDownloadUrl(
  resend: Resend,
  resendEmailId: string,
  attachmentId: string,
): Promise<string> {
  const { data, error } = await resend.emails.receiving.attachments.get({
    emailId: resendEmailId,
    id: attachmentId,
  });
  if (error) {
    console.warn('[email-attachments] get failed', { resendEmailId, attachmentId, error: error.message });
    return '';
  }
  return attachmentDownloadUrl(data ?? {});
}

/**
 * Download Resend inbound attachments and save them under the linked project.
 * Skips files already imported for this email (sourceRef = `{emailId}:{attachmentId}`).
 */
export async function importEmailAttachmentsToProject(input: {
  emailId: string;
  resendEmailId?: string | null;
  jobSlug: string;
  uploadedBy?: string | null;
}): Promise<EmailAttachmentImportResult> {
  const result: EmailAttachmentImportResult = { imported: [], skipped: 0, errors: [] };

  const emailId = input.emailId.trim();
  const resendEmailId = input.resendEmailId?.trim() ?? '';
  const jobSlug = input.jobSlug.trim();

  if (!emailId || !resendEmailId || !jobSlug || !isSafeWorkSlug(jobSlug)) {
    return result;
  }

  const resend = getResendClient();
  if (!resend) {
    result.errors.push('RESEND_API_KEY not configured');
    return result;
  }

  const existing = await storeListProjectFiles(jobSlug);
  const existingRefs = new Set(
    existing
      .map((f) => f.sourceRef?.trim())
      .filter((ref): ref is string => !!ref),
  );

  const attachments = await listResendAttachments(resend, resendEmailId);
  if (!attachments.length) return result;

  for (const att of attachments) {
    const attachmentId = String(att.id ?? '').trim();
    if (!attachmentId) continue;

    const sourceRef = emailAttachmentSourceRef(emailId, attachmentId);
    if (existingRefs.has(sourceRef)) {
      result.skipped += 1;
      continue;
    }

    let downloadUrl = attachmentDownloadUrl(att);
    if (!downloadUrl) {
      downloadUrl = await getResendAttachmentDownloadUrl(resend, resendEmailId, attachmentId);
    }
    if (!downloadUrl) {
      result.errors.push(`No download URL for attachment ${attachmentId}`);
      continue;
    }

    let buffer: Buffer;
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        result.errors.push(`Download failed for ${attachmentId} (${response.status})`);
        continue;
      }
      buffer = Buffer.from(await response.arrayBuffer());
    } catch (e) {
      result.errors.push(`Download failed for ${attachmentId}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    if (!buffer.length) {
      result.errors.push(`Empty attachment ${attachmentId}`);
      continue;
    }

    const filename = String(att.filename ?? '').trim() || `attachment-${attachmentId}`;
    const mediaType = normalizeEmailAttachmentMediaType(
      attachmentContentType(att),
      filename,
    );
    if (!isAllowedProjectFileMediaType(mediaType, 'email')) {
      result.errors.push(`Unsupported attachment type for ${filename}: ${mediaType || 'unknown'}`);
      continue;
    }

    const saved = await storeAddProjectFile(jobSlug, {
      filename,
      mediaType,
      dataBase64: buffer.toString('base64'),
      uploadedBy: input.uploadedBy?.trim() || null,
      source: 'email',
      sourceRef,
    });

    if (saved.ok) {
      result.imported.push(saved.file);
      existingRefs.add(sourceRef);
    } else {
      result.errors.push(`${filename}: ${saved.error}`);
    }
  }

  if (result.imported.length) {
    console.info('[email-attachments] imported to project', {
      jobSlug,
      emailId,
      count: result.imported.length,
      skipped: result.skipped,
    });
  }

  return result;
}
