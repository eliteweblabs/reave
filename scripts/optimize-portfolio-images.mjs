/**
 * Optimize portfolio images for the masonry grid.
 *
 * Reads from public/images/portfolio/ (drop zone for new assets),
 * writes JPEG/WebP-ready sources to src/assets/images/portfolio/.
 *
 * Usage: node scripts/optimize-portfolio-images.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const INPUT_DIR = path.join(ROOT, 'public/images/portfolio');
const OUTPUT_DIR = path.join(ROOT, 'src/assets/images/portfolio');

const MAX_WIDTH = 1600;
const JPEG_QUALITY = 82;

/** Prefer .jpg over .png when both exist (same basename). */
function pickInputs(files) {
  const byBase = new Map();
  for (const file of files) {
    if (!/\.(png|jpe?g)$/i.test(file)) continue;
    const base = file.replace(/\.(png|jpe?g)$/i, '').toLowerCase();
    const ext = path.extname(file).toLowerCase();
    const rank = ext === '.jpg' || ext === '.jpeg' ? 0 : 1;
    const prev = byBase.get(base);
    if (!prev || rank < prev.rank) {
      byBase.set(base, { file, rank });
    }
  }
  return [...byBase.values()].map(({ file }) => file).sort();
}

async function optimizeOne(inputFile) {
  const inputPath = path.join(INPUT_DIR, inputFile);
  const base = inputFile.replace(/\.(png|jpe?g)$/i, '');
  const outputPath = path.join(OUTPUT_DIR, `${base}.jpg`);

  const image = sharp(inputPath);
  const meta = await image.metadata();

  let pipeline = image.rotate();
  if (meta.width && meta.width > MAX_WIDTH) {
    pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
  }

  await pipeline
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(outputPath);

  const inStat = fs.statSync(inputPath);
  const outStat = fs.statSync(outputPath);
  const outMeta = await sharp(outputPath).metadata();
  console.log(
    `${inputFile} → ${path.basename(outputPath)} (${meta.width}x${meta.height} → ${outMeta.width}x${outMeta.height}, ${fmt(inStat.size)} → ${fmt(outStat.size)})`,
  );
}

function fmt(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}K`;
  return `${bytes}B`;
}

async function main() {
  if (!fs.existsSync(INPUT_DIR)) {
    console.error(`Missing input directory: ${INPUT_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const inputs = pickInputs(fs.readdirSync(INPUT_DIR));
  if (inputs.length === 0) {
    console.log('No portfolio images to optimize.');
    return;
  }

  let totalIn = 0;
  let totalOut = 0;
  for (const file of inputs) {
    totalIn += fs.statSync(path.join(INPUT_DIR, file)).size;
    await optimizeOne(file);
    totalOut += fs.statSync(
      path.join(OUTPUT_DIR, file.replace(/\.(png|jpe?g)$/i, '.jpg')),
    ).size;
  }

  console.log(`\n${inputs.length} images optimized (${fmt(totalIn)} → ${fmt(totalOut)})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
