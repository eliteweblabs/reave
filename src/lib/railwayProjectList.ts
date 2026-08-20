export type RailwayProjectListNode = {
  id: string;
  name: string;
  deletedAt?: string | null;
  expiredAt?: string | null;
  isTempProject?: boolean | null;
};

/** Live Railway projects only — the dashboard hides deleted, expired, and temp ones. */
export function isActiveRailwayProject(p: RailwayProjectListNode): boolean {
  return !p.deletedAt && !p.expiredAt && !p.isTempProject;
}
