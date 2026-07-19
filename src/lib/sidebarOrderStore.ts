/**
 * Sidebar list order — Postgres (DATABASE_URL).
 */

export {
  isSidebarOrderDbConfigured,
  sortBySidebarOrder,
  type SidebarListName,
} from './pgSidebarOrder';

import {
  dbGetSidebarOrder,
  dbReorderSidebarList,
  type SidebarListName,
} from './pgSidebarOrder';

export async function storeGetSidebarOrder(listName: SidebarListName) {
  return dbGetSidebarOrder(listName);
}

export async function storeReorderSidebarList(listName: SidebarListName, keys: string[]) {
  return dbReorderSidebarList(listName, keys);
}
