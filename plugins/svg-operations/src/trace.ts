/**
 * Image to SVG tracing using Potrace
 */

import { promises as fs } from 'fs';
import path from 'path';
import potrace from 'potrace';
import sharp from 'sharp';
import type { TraceSVGConfig, SVGResult } from './types.js';

export async function traceSVG(config: TraceSVGConfig): Promise<SVGResult> {
  const { inputPath, outputPath, options = {} } = config;

  // Validate input file exists
  try {
    await fs.access(inputPath);
  } catch {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Get image dimensions
  const metadata = await sharp(inputPath).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // Prepare image for tracing (convert to suitable format)
  const imageBuffer = await sharp(inputPath)
    .ensureAlpha()
    .toBuffer();

  // Trace the image
  const svgContent = await new Promise<string>((resolve, reject) => {
    potrace.trace(imageBuffer, {
      threshold: options.threshold ?? 128,
      turnPolicy: options.turnPolicy ?? 'minority',
      turdSize: options.turdSize ?? 2,
      optCurve: options.optCurve ?? true,
      alphaMax: options.alphaMax ?? 1.0,
      color: options.color ?? '#000000',
      background: options.background ?? 'transparent'
    }, (err, svg) => {
      if (err) {
        reject(err);
      } else {
        resolve(svg);
      }
    });
  });

  // Determine output path
  const finalOutputPath = outputPath || 
    path.join(
      path.dirname(inputPath),
      `${path.basename(inputPath, path.extname(inputPath))}.svg`
    );

  // Write SVG to file
  await fs.writeFile(finalOutputPath, svgContent, 'utf-8');

  // Count paths in the SVG
  const pathCount = (svgContent.match(/<path/g) || []).length;

  // Get file size
  const stats = await fs.stat(finalOutputPath);

  return {
    svgPath: finalOutputPath,
    svgContent,
    fileSize: stats.size,
    width,
    height,
    pathCount
  };
}
