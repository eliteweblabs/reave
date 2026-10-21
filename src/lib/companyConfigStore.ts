export async function getStoredCompanyConfig(): Promise<StoredCompanyConfig | null> {
  if (_cached !== undefined) return _cached;
  try {
    if (companyConfigStorageBackend() === 'postgres') {
      _cached = await readPgConfig();
    } else {
      _cached = readFileConfig();
    }
  } catch (e) {
    console.error('[company-config] read failed', e);
    _cached = null;
  }
  // Allow Railway env vars to override DB values so installs with seeded
  // placeholder data pick up the real contact info without a reseed.
  if (_cached) {
    const envPhone = serverEnv('COMPANY_PHONE');
    const envEmail = serverEnv('COMPANY_EMAIL');
    if (envPhone) _cached = { ..._cached, supportPhone: envPhone };
    if (envEmail) _cached = { ..._cached, supportEmail: envEmail };
  }
  return _cached;
}