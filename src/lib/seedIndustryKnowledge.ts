/**
 * Upsert industry playbooks into the knowledge table on first boot
 * so they show in Admin → Knowledge as the firm’s own books — not a homework assignment.
 */
import { renderCourtsKnowledge, resolveCourtGate } from './courtRadius';
import { knowledgeIndustryId } from './knowledgeIndustry';
import { industryKnowledgeEntries, parseKnowledgeMarkdown } from './localKnowledge';
import { dbWriteKnowledge, isKnowledgeDbConfigured } from './pgKnowledge';
import { createLogger } from './logger';
import { gateFromEnv, getPracticeGate, isDefaultPracticeGate, setPracticeGate } from './practiceGate';

const log = createLogger('knowledge:industry');

export async function seedIndustryKnowledge(industry?: string | null): Promise<{
  ok: boolean;
  seeded: string[];
  detail: string;
}> {
  const id = knowledgeIndustryId(industry);
  if (!id) return { ok: true, seeded: [], detail: 'No industry knowledge folder' };
  if (!isKnowledgeDbConfigured()) {
    return { ok: true, seeded: [], detail: 'Knowledge DB not configured — bundled industry docs still load' };
  }

  const docs = industryKnowledgeEntries(id);
  let gate = await getPracticeGate();
  if (id === 'law' && isDefaultPracticeGate(gate)) {
    const env = gateFromEnv();
    if (env.radiusMi || env.counties?.length || env.states?.length || env.practiceArea || env.gateMode) {
      gate = await setPracticeGate({ ...gate, ...env });
    }
  }
  const seeded: string[] = [];
  for (const doc of docs) {
    if (doc.slug.startsWith('bankruptcy-') && gate.practiceArea !== 'bankruptcy' && gate.practiceArea !== 'general') {
      continue;
    }
    const parsed = parseKnowledgeMarkdown(doc.content);
    const result = await dbWriteKnowledge({
      slug: doc.slug,
      title: parsed.title || doc.slug,
      content: parsed.body,
      tags: parsed.tags,
    });
    if (result.ok) seeded.push(doc.slug);
    else log.error(`failed to seed ${doc.slug}: ${result.error}`);
  }
  if (id === 'law') {
    const resolved = await resolveCourtGate();
    const markdown = renderCourtsKnowledge(resolved);
    const courts = await dbWriteKnowledge({
      slug: 'courts-in-radius',
      title: 'Courts in this office’s gate',
      content: markdown.replace(/^---[\s\S]*?---\n/, ''),
      tags: ['courts', 'map', gate.practiceArea],
    });
    if (courts.ok) seeded.push('courts-in-radius');
  }
  return { ok: true, seeded, detail: `Seeded ${seeded.length} ${id} knowledge docs` };
}
