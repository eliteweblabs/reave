/**
 * SVG Operations Plugin
 * 
 * Provides image vectorization, OCR, and font recognition capabilities
 */

export { traceSVG } from './trace.js';
export { extractText } from './ocr.js';
export { recognizeFont } from './font-recognition.js';
export { explodeSVG } from './explode.js';

export type {
  TraceSVGConfig,
  SVGResult,
  OCRConfig,
  OCRResult,
  FontConfig,
  FontResult,
  ExplodeConfig,
  ExplodeResult
} from './types.js';
