/**
 * Type definitions for SVG operations plugin
 */

export interface TraceSVGConfig {
  inputPath: string;
  outputPath?: string;
  options?: {
    threshold?: number;
    turnPolicy?: 'black' | 'white' | 'left' | 'right' | 'minority' | 'majority';
    turdSize?: number;
    optCurve?: boolean;
    alphaMax?: number;
    color?: string;
    background?: string;
  };
}

export interface SVGResult {
  svgPath: string;
  svgContent: string;
  fileSize: number;
  width: number;
  height: number;
  pathCount: number;
}

export interface OCRConfig {
  inputPath: string;
  language?: string;
  options?: {
    preserveInterword?: boolean;
    tessedit_char_whitelist?: string;
    tessedit_pageseg_mode?: number;
  };
}

export interface OCRWord {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export interface OCRResult {
  text: string;
  confidence: number;
  words: OCRWord[];
  language: string;
}

export interface FontConfig {
  inputPath: string;
  apiKey?: string;
  provider?: 'whatthefont' | 'custom';
  endpoint?: string;
}

export interface DetectedFont {
  name: string;
  confidence: number;
  family: string;
  weight?: string;
  style?: string;
  foundry?: string;
  similarity: number;
}

export interface FontResult {
  fonts: DetectedFont[];
  primaryFont: DetectedFont | null;
  textSamples: Array<{
    text: string;
    font: DetectedFont;
    bbox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
}

export interface ExplodeConfig {
  inputPath: string;
  outputDir: string;
  options?: {
    vectorize?: boolean;
    ocr?: boolean;
    fontRecognition?: boolean;
    svgOptions?: TraceSVGConfig['options'];
    ocrOptions?: OCRConfig['options'];
    fontApiKey?: string;
  };
}

export interface ExplodeResult {
  svg: SVGResult | null;
  text: OCRResult | null;
  fonts: FontResult | null;
  outputFiles: {
    svg?: string;
    textJson?: string;
    fontsJson?: string;
  };
}
