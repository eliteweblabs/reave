/**
 * On-the-fly library thumbnails: images via sharp, PDFs via first-page render.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

function isPdfMediaType(mediaType: string): boolean {
  return mediaType.trim().toLowerCase() === 'application/pdf';
}

function isRasterImageType(mediaType: string): boolean {
  return /image\/(jpeg|png|gif|webp)/i.test(mediaType.trim());
}

export const MEDIA_THUMB_SIZE = 256;

const require = createRequire(import.meta.url);

function pdfjsRoot(): string {
  return dirname(require.resolve('pdfjs-dist/package.json'));
}

function pdfjsDirUrl(rel: string): string {
  return pathToFileURL(join(pdfjsRoot(), rel) + '/').href;
}

async function renderPdfFirstPageJpeg(bytes: Buffer, size: number): Promise<Buffer | null> {
  try {
    const [{ getDocument, GlobalWorkerOptions }, { createCanvas }] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('@napi-rs/canvas'),
    ]);
    if (!GlobalWorkerOptions.workerSrc) {
      GlobalWorkerOptions.workerSrc = pathToFileURL(
        require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
      ).href;
    }

    const loadingTask = getDocument({
      data: new Uint8Array(bytes),
      disableFontFace: true,
      disableAutoFetch: true,
      isOffscreenCanvasSupported: false,
      cMapUrl: pdfjsDirUrl('cmaps'),
      cMapPacked: true,
      standardFontDataUrl: pdfjsDirUrl('standard_fonts'),
      wasmUrl: pdfjsDirUrl('wasm'),
    });
    const doc = await loadingTask.promise;
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min((size * 2) / base.width, (size * 2) / base.height, 2.5);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvasContext: ctx as unknown as CanvasRenderingContext2D,
        viewport,
        canvas: canvas as unknown as HTMLCanvasElement,
      }).promise;
      const png = canvas.toBuffer('image/png');
      return sharp(png)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255 },
        })
        .jpeg({ quality: 82 })
        .toBuffer();
    } finally {
      await loadingTask.destroy().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

export async function mediaLibraryThumbnail(
  record: { mediaType: string; dataBase64: string },
  thumb: boolean,
): Promise<{ body: Buffer; mediaType: string }> {
  const bytes = Buffer.from(record.dataBase64, 'base64');
  const type = record.mediaType.trim().toLowerCase() || record.mediaType;
  if (!thumb) return { body: bytes, mediaType: record.mediaType };

  if (isPdfMediaType(type)) {
    const jpeg = await renderPdfFirstPageJpeg(bytes, MEDIA_THUMB_SIZE);
    if (jpeg) return { body: jpeg, mediaType: 'image/jpeg' };
    return { body: bytes, mediaType: record.mediaType };
  }

  if (!isRasterImageType(type)) {
    return { body: bytes, mediaType: record.mediaType };
  }

  try {
    const jpeg = await sharp(bytes)
      .rotate()
      .resize(MEDIA_THUMB_SIZE, MEDIA_THUMB_SIZE, { fit: 'cover', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return { body: jpeg, mediaType: 'image/jpeg' };
  } catch {
    return { body: bytes, mediaType: record.mediaType };
  }
}
