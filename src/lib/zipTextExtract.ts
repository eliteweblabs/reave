/**
 * Pull human-readable text files out of a zip for agent context (chat uploads).
 */
import yauzl from 'yauzl';

const TEXT_FILE_RE = /\.(json|md|markdown|txt|csv|tsv|ya?ml)$/i;
const SKIP_PATH_RE = /(?:^|\/)(?:__MACOSX|\.git)(?:\/|$)|\/\.DS_Store$/i;
const MAX_FILES = 40;
const MAX_EXTRACTED_CHARS = 40_000;
const MAX_FILE_CHARS = 20_000;

export interface ZipTextExtractResult {
  fileCount: number;
  text: string;
}

function readMatchingZipEntries(
  buffer: Buffer,
  match: (name: string) => boolean,
): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error('Failed to open zip archive'));
        return;
      }
      const out = new Map<string, Buffer>();
      zipfile.on('error', reject);
      zipfile.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName) || SKIP_PATH_RE.test(entry.fileName) || !match(entry.fileName)) {
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

function fenceForPath(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'json') return 'json';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'yaml' || ext === 'yml') return 'yaml';
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  return '';
}

export async function extractZipTextFiles(buffer: Buffer): Promise<ZipTextExtractResult> {
  const entries = await readMatchingZipEntries(buffer, (name) => TEXT_FILE_RE.test(name));
  const names = [...entries.keys()].sort((a, b) => a.localeCompare(b)).slice(0, MAX_FILES);

  const parts: string[] = [];
  let totalChars = 0;

  for (const name of names) {
    let body = entries.get(name)!.toString('utf8');
    if (body.length > MAX_FILE_CHARS) {
      body = `${body.slice(0, MAX_FILE_CHARS)}\n…[file truncated]`;
    }
    const fence = fenceForPath(name);
    const block = fence
      ? `### ${name}\n\`\`\`${fence}\n${body}\n\`\`\``
      : `### ${name}\n\`\`\`\n${body}\n\`\`\``;
    if (totalChars + block.length > MAX_EXTRACTED_CHARS) {
      parts.push('…[remaining zip files omitted — output limit reached]');
      break;
    }
    parts.push(block);
    totalChars += block.length;
  }

  let text = parts.join('\n\n');
  if (!text.trim()) {
    text = '(no readable text files found — only .json, .md, .txt, .csv, .yaml, etc. are extracted)';
  } else if (entries.size > names.length) {
    text = `${text}\n\n…[${entries.size - names.length} additional matching file(s) not shown]`;
  }

  return { fileCount: names.length, text };
}
