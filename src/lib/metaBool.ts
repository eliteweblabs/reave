/** Parse Clerk publicMetadata / admin form booleans; default when unset. */
export function parseMetaBool(value: unknown, defaultValue = true): boolean {
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  if (value === true || value === 'true' || value === '1' || value === 'on' || value === 1) return true;
  return defaultValue;
}

export function parseFormBool(value: unknown): boolean {
  return parseMetaBool(value, false);
}
