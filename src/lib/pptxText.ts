/**
 * Minimal PPTX (Office Open XML presentation) text extraction. A .pptx is a
 * zip archive; slide bodies live at ppt/slides/slideN.xml as runs of `<a:t>`
 * inside `<a:p>` paragraphs. We unzip with yauzl and pull text out with
 * regex rather than a full XML parser — plenty for "what does this deck say".
 *
 * Note: slides are ordered by filename (slide1.xml, slide2.xml, …), which
 * matches creation order but can drift from the on-screen order if the user
 * heavily reordered slides in PowerPoint without file-level renumbering.
 */
import yauzl from 'yauzl';

export interface PptxExtractResult {
  slideCount: number;
  text: string;
}

const SLIDE_NAME_RE = /^ppt\/slides\/slide(\d+)\.xml$/;
const MAX_EXTRACTED_CHARS = 40_000;

function slideNumberFromName(name: string): number {
  const match = SLIDE_NAME_RE.exec(name);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&');
}

function extractSlideText(xml: string): string {
  const lines: string[] = [];
  const paragraphRe = /<a:p[ >][\s\S]*?<\/a:p>/g;
  let paraMatch: RegExpExecArray | null;
  while ((paraMatch = paragraphRe.exec(xml))) {
    const runRe = /<a:t>([\s\S]*?)<\/a:t>/g;
    let runMatch: RegExpExecArray | null;
    let line = '';
    while ((runMatch = runRe.exec(paraMatch[0]))) {
      line += decodeXmlEntities(runMatch[1]);
    }
    if (line.trim()) lines.push(line);
  }
  return lines.join('\n');
}

function readZipEntries(buffer: Buffer, names: (name: string) => boolean): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error('Failed to open pptx archive'));
        return;
      }
      const out = new Map<string, Buffer>();
      zipfile.on('error', reject);
      zipfile.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName) || !names(entry.fileName)) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            zipfile.readEntry();
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk) => chunks.push(chunk as Buffer));
          stream.on('error', reject);
          stream.on('end', () => {
            out.set(entry.fileName, Buffer.concat(chunks));
            zipfile.readEntry();
          });
        });
      });
      zipfile.on('end', () => resolve(out));
      zipfile.readEntry();
    });
  });
}

export async function extractPptxText(buffer: Buffer): Promise<PptxExtractResult> {
  const entries = await readZipEntries(buffer, (name) => SLIDE_NAME_RE.test(name));
  const slideNames = [...entries.keys()].sort(
    (a, b) => slideNumberFromName(a) - slideNumberFromName(b),
  );

  const parts: string[] = [];
  for (const name of slideNames) {
    const xml = entries.get(name)!.toString('utf8');
    const text = extractSlideText(xml).trim();
    parts.push(`Slide ${slideNumberFromName(name)}:\n${text || '(no text on this slide)'}`);
  }

  let combined = parts.join('\n\n');
  if (combined.length > MAX_EXTRACTED_CHARS) {
    combined = `${combined.slice(0, MAX_EXTRACTED_CHARS)}\n…[presentation text truncated]`;
  }
  return { slideCount: slideNames.length, text: combined };
}
