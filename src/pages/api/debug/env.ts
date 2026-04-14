import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const envCheck = {
    hasProcessEnv: typeof process !== 'undefined' && typeof process.env !== 'undefined',
    calcomDatabaseUrl: {
      exists: !!process.env.CALCOM_DATABASE_URL,
      length: process.env.CALCOM_DATABASE_URL?.length || 0,
      first20: process.env.CALCOM_DATABASE_URL?.substring(0, 20) || 'not set',
    },
    calcomUsername: {
      exists: !!process.env.CALCOM_USERNAME,
      value: process.env.CALCOM_USERNAME || 'not set',
    },
    nodeEnv: process.env.NODE_ENV || 'not set',
    allEnvKeys: Object.keys(process.env).filter(k => k.includes('CALCOM')).sort(),
  };

  return new Response(JSON.stringify(envCheck, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};
