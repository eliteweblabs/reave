/**
 * OCR (Optical Character Recognition) using Tesseract.js
 */

import { promises as fs } from 'fs';
import { createWorker } from 'tesseract.js';
import type { OCRConfig, OCRResult, OCRWord } from './types.js';

export async function extractText(config: OCRConfig): Promise<OCRResult> {
  const { inputPath, language = 'eng', options = {} } = config;

  // Validate input file exists
  try {
    await fs.access(inputPath);
  } catch {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Initialize Tesseract worker
  const worker = await createWorker(language);

  try {
    // Configure Tesseract options
    if (options.tessedit_char_whitelist) {
      await worker.setParameters({
        tessedit_char_whitelist: options.tessedit_char_whitelist
      });
    }

    if (options.tessedit_pageseg_mode !== undefined) {
      await worker.setParameters({
        tessedit_pageseg_mode: options.tessedit_pageseg_mode
      });
    }

    if (options.preserveInterword !== undefined) {
      await worker.setParameters({
        preserve_interword_spaces: options.preserveInterword ? '1' : '0'
      });
    }

    // Perform OCR
    const result = await worker.recognize(inputPath);

    // Extract word-level data with bounding boxes
    const words: OCRWord[] = result.data.words.map(word => ({
      text: word.text,
      confidence: word.confidence,
      bbox: {
        x0: word.bbox.x0,
        y0: word.bbox.y0,
        x1: word.bbox.x1,
        y1: word.bbox.y1
      }
    }));

    // Calculate average confidence
    const totalConfidence = words.reduce((sum, word) => sum + word.confidence, 0);
    const averageConfidence = words.length > 0 ? totalConfidence / words.length : 0;

    return {
      text: result.data.text,
      confidence: averageConfidence,
      words,
      language
    };
  } finally {
    // Clean up worker
    await worker.terminate();
  }
}
