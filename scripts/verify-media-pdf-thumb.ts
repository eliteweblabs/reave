/**
 * Guards first-page JPEG thumbs for media-library PDFs.
 * Run: npm run check:media-thumb
 */
import assert from 'node:assert/strict';
import { mediaLibraryThumbnail } from '../src/lib/mediaThumbnail.ts';

const results: string[] = [];
let failures = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    results.push(`  ok   ${name}`);
  } catch (err) {
    failures++;
    results.push(`  FAIL ${name}\n         ${err instanceof Error ? err.message : String(err)}`);
  }
}

const MINIMAL_PDF = `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 44 >>stream
BT /F1 18 Tf 36 320 Td (Preview) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000368 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
448
%%EOF
`;

await test('PDF thumb is a JPEG of the first page', async () => {
  const { body, mediaType } = await mediaLibraryThumbnail(
    { mediaType: 'application/pdf', dataBase64: Buffer.from(MINIMAL_PDF).toString('base64') },
    true,
  );
  assert.equal(mediaType, 'image/jpeg');
  assert.ok(body.length > 200);
  assert.equal(body[0], 0xff);
  assert.equal(body[1], 0xd8);
});

await test('non-thumb PDF stays a PDF', async () => {
  const raw = Buffer.from(MINIMAL_PDF);
  const { body, mediaType } = await mediaLibraryThumbnail(
    { mediaType: 'application/pdf', dataBase64: raw.toString('base64') },
    false,
  );
  assert.equal(mediaType, 'application/pdf');
  assert.equal(body.toString('latin1').slice(0, 5), '%PDF-');
});

console.log(results.join('\n'));
if (failures) {
  console.error(`\n${failures} media-thumb check(s) failed`);
  process.exit(1);
}
console.log('\nAll media-thumb checks passed');
