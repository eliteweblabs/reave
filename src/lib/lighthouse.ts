import fetch from 'node-fetch';

export interface LighthouseAuditResult {
  categories: {
    performance: { score: number };
    accessibility: { score: number };
    'best-practices': { score: number };
    seo: { score: number };
  };
  metrics: {
    first_contentful_paint: number;
    largest_contentful_paint: number;
    cumulative_layout_shift: number;
    total_blocking_time: number;
  };
}

export async function runLighthouseAudit(
  url: string,
  strategy: 'mobile' | 'desktop' | 'both' = 'both'
): Promise<LighthouseAuditResult> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;

  if (!apiKey) {
    throw new Error('GOOGLE_PAGESPEED_API_KEY environment variable is not set');
  }

  const strategies = strategy === 'both' ? ['mobile', 'desktop'] : [strategy];
  const results: any = {};

  for (const strat of strategies) {
    const params = new URLSearchParams({
      url,
      key: apiKey,
      strategy: strat,
      category: ['performance', 'accessibility', 'best-practices', 'seo'].join(','),
    });

    const response = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`
    );

    if (!response.ok) {
      throw new Error(`PageSpeed API error: ${response.statusText}`);
    }

    const data = await response.json();
    results[strat] = data;
  }

  return results;
}
