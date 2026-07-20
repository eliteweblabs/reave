/**
 * Font recognition using external APIs or local analysis
 */

import { promises as fs } from 'fs';
import sharp from 'sharp';
import type { FontConfig, FontResult, DetectedFont } from './types.js';

export async function recognizeFont(config: FontConfig): Promise<FontResult> {
  const { inputPath, apiKey, provider = 'custom', endpoint } = config;

  // Validate input file exists
  try {
    await fs.access(inputPath);
  } catch {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Get image metadata
  const metadata = await sharp(inputPath).metadata();

  // If using external API
  if (apiKey && (provider === 'whatthefont' || endpoint)) {
    return await recognizeFontViaAPI(inputPath, apiKey, endpoint);
  }

  // Fallback: basic local analysis (limited without external service)
  return await recognizeFontLocal(inputPath);
}

async function recognizeFontViaAPI(
  imagePath: string,
  apiKey: string,
  endpoint?: string
): Promise<FontResult> {
  // Read image as buffer
  const imageBuffer = await fs.readFile(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const apiEndpoint = endpoint || process.env.FONT_RECOGNITION_ENDPOINT;
  
  if (!apiEndpoint) {
    throw new Error(
      'Font recognition API endpoint not configured. ' +
      'Set FONT_RECOGNITION_ENDPOINT environment variable or provide endpoint in config.'
    );
  }

  try {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        image: base64Image
      })
    });

    if (!response.ok) {
      throw new Error(`Font API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Transform API response to our format
    const fonts: DetectedFont[] = (data.fonts || []).map((font: any) => ({
      name: font.name || font.fontName,
      confidence: font.confidence || font.score || 0.5,
      family: font.family || font.fontFamily || font.name,
      weight: font.weight,
      style: font.style,
      foundry: font.foundry,
      similarity: font.similarity || font.confidence || 0.5
    }));

    return {
      fonts,
      primaryFont: fonts.length > 0 ? fonts[0] : null,
      textSamples: data.textSamples || []
    };
  } catch (error) {
    throw new Error(
      `Font recognition API call failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function recognizeFontLocal(imagePath: string): Promise<FontResult> {
  // This is a placeholder for local font analysis
  // In a production system, this could:
  // 1. Extract text regions using OCR
  // 2. Analyze glyph shapes
  // 3. Compare against a local font database
  // 4. Use machine learning models for font classification

  console.warn(
    'Local font recognition is limited. For better results, configure a font recognition API.'
  );

  // Perform basic image analysis
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const stats = await image.stats();

  // Return a "best guess" based on image characteristics
  // This is a simplified placeholder
  const guessedFont: DetectedFont = {
    name: 'Unknown Font',
    confidence: 0.3,
    family: 'Sans-serif (estimated)',
    similarity: 0.3
  };

  return {
    fonts: [guessedFont],
    primaryFont: guessedFont,
    textSamples: []
  };
}

// Helper: Analyze font characteristics from image regions
async function analyzeFontCharacteristics(imageBuffer: Buffer): Promise<{
  hasSerifs: boolean;
  isMonospace: boolean;
  avgStrokeWidth: number;
  xHeight: number;
}> {
  // Placeholder for font characteristic analysis
  // Would need computer vision / ML models for accurate results
  return {
    hasSerifs: false,
    isMonospace: false,
    avgStrokeWidth: 2,
    xHeight: 0.5
  };
}
