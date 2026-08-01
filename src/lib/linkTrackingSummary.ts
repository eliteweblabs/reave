/**
 * Generate a human-readable summary of link sharing status for a project.
 * Used in the work editor header to show whether a link has been shared.
 */

import type { TrackedLinkRecord } from './linkTracking';

export interface LinkSharingStatus {
  /** 'shared', 'opened', or 'not_shared' */
  status: 'not_shared' | 'shared' | 'opened';
  /** Human-readable message for the UI header */
  message: string;
  /** The most recent tracked link (if any) */
  latestLink?: TrackedLinkRecord;
}

/**
 * Determine the sharing status based on tracked links.
 * Returns a status and human-readable message for the project header.
 */
export function getSharingStatus(trackedLinks: TrackedLinkRecord[]): LinkSharingStatus {
  if (!trackedLinks || trackedLinks.length === 0) {
    return {
      status: 'not_shared',
      message: 'has not been shared',
    };
  }

  // Sort by most recent first
  const sorted = [...trackedLinks].sort((a, b) => {
    const aTime = new Date(a.sent_at).getTime();
    const bTime = new Date(b.sent_at).getTime();
    return bTime - aTime;
  });

  const latest = sorted[0]!;

  if (latest.click_count > 0) {
    return {
      status: 'opened',
      message: `link opened ${latest.click_count} time${latest.click_count !== 1 ? 's' : ''}`,
      latestLink: latest,
    };
  }

  return {
    status: 'shared',
    message: 'link shared',
    latestLink: latest,
  };
}
