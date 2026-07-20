/**
 * Combined "explode" operation: SVG tracing + OCR + Font recognition
 */

import { promises as fs } from 'fs';
import path from 'path';
import { traceSVG } from './trace.js';
import { extractText } from './ocr.js';
import { recognizeFont } from './font-recognition.js';
import type { ExplodeConfig, ExplodeResult } from './types.js';

export async function explodeSVG(config: ExplodeConfig): Promise<ExplodeResult> {
  const { inputPath, outputDir, options = {} } = config;

  // Validate input file exists
  try {
    await fs.access(inputPath);
  } catch {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Create output directory if it doesn't exist
  await fs.mkdir(outputDir, { recursive: true });

  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputFiles: ExplodeResult['outputFiles'] = {};

  let svgResult = null;
  let textResult = null;
  let fontResult = null;

  // 1. Vectorize image to SVG
  if (options.vectorize !== false) {
    console.log('Tracing image to SVG...');
    const svgOutputPath = path.join(outputDir, `${baseName}.svg`);
    
    try {
      svgResult = await traceSVG({
        inputPath,
        outputPath: svgOutputPath,
        options: options.svgOptions
      });
      outputFiles.svg = svgOutputPath;
      console.log(`✓ SVG created: ${svgOutputPath} (${svgResult.pathCount} paths)`);
    } catch (error) {
      console.error('SVG tracing failed:', error);
    }
  }

  // 2. Extract text via OCR
  if (options.ocr !== false) {
    console.log('Extracting text via OCR...');
    const textJsonPath = path.join(outputDir, `${baseName}.text.json`);
    
    try {
      textResult = await extractText({
        inputPath,
        language: 'eng',
        options: options.ocrOptions
      });

      await fs.writeFile(
        textJsonPath,
        JSON.stringify(textResult, null, 2),
        'utf-8'
      );
      outputFiles.textJson = textJsonPath;
      console.log(`✓ Text extracted: ${textResult.words.length} words, ${textResult.confidence.toFixed(1)}% confidence`);
    } catch (error) {
      console.error('OCR failed:', error);
    }
  }

  // 3. Recognize fonts
  if (options.fontRecognition !== false) {
    console.log('Recognizing fonts...');
    const fontsJsonPath = path.join(outputDir, `${baseName}.fonts.json`);
    
    try {
      fontResult = await recognizeFont({
        inputPath,
        apiKey: options.fontApiKey || process.env.FONT_RECOGNITION_API_KEY
      });

      await fs.writeFile(
        fontsJsonPath,
        JSON.stringify(fontResult, null, 2),
        'utf-8'
      );
      outputFiles.fontsJson = fontsJsonPath;
      
      if (fontResult.primaryFont) {
        console.log(`✓ Font detected: ${fontResult.primaryFont.name} (${(fontResult.primaryFont.confidence * 100).toFixed(1)}% confidence)`);
      }
    } catch (error) {
      console.error('Font recognition failed:', error);
    }
  }

  return {
    svg: svgResult,
    text: textResult,
    fonts: fontResult,
    outputFiles
  };
}
