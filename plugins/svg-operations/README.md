# SVG Operations Plugin

A standalone plugin for SVG operations including image vectorization, OCR (text extraction), and font recognition.

## Features

- **Image to SVG Tracing**: Convert raster images (PNG, JPG, etc.) to vector SVG format
- **OCR (Optical Character Recognition)**: Extract text from images with positioning data
- **Font Recognition**: Identify fonts used in images (requires external API integration)
- **SVG Optimization**: Clean and optimize generated SVG files

## Installation

```bash
cd plugins/svg-operations
npm install
npm run build
```

## Usage

### Image to SVG Tracing

```typescript
import { traceSVG } from '@reave/svg-operations-plugin';

const svgResult = await traceSVG({
  inputPath: './image.png',
  outputPath: './output.svg',
  options: {
    threshold: 128,
    turnPolicy: 'minority',
    turdSize: 2,
    optCurve: true,
    alphaMax: 1.0
  }
});

console.log('SVG created:', svgResult.svgPath);
console.log('File size:', svgResult.fileSize);
```

### OCR Text Extraction

```typescript
import { extractText } from '@reave/svg-operations-plugin';

const ocrResult = await extractText({
  inputPath: './document.png',
  language: 'eng',
  options: {
    preserveInterword: true,
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '
  }
});

console.log('Extracted text:', ocrResult.text);
console.log('Confidence:', ocrResult.confidence);
console.log('Words with positions:', ocrResult.words);
```

### Font Recognition

```typescript
import { recognizeFont } from '@reave/svg-operations-plugin';

const fontResult = await recognizeFont({
  inputPath: './text-sample.png',
  apiKey: process.env.FONT_RECOGNITION_API_KEY
});

console.log('Detected fonts:', fontResult.fonts);
console.log('Primary font:', fontResult.primaryFont);
```

### Combined SVG + OCR Operation

```typescript
import { explodeSVG } from '@reave/svg-operations-plugin';

// "Explode" an image: trace to SVG + extract text + identify fonts
const result = await explodeSVG({
  inputPath: './design.png',
  outputDir: './output',
  options: {
    vectorize: true,
    ocr: true,
    fontRecognition: true
  }
});

console.log('SVG:', result.svg);
console.log('Text:', result.text);
console.log('Fonts:', result.fonts);
```

## API Reference

### `traceSVG(config: TraceSVGConfig): Promise<SVGResult>`

Converts a raster image to SVG using Potrace algorithm.

**Config Options:**
- `inputPath: string` - Path to input image
- `outputPath?: string` - Optional output path (defaults to input name + .svg)
- `options.threshold?: number` - Black/white threshold (0-255, default: 128)
- `options.turnPolicy?: string` - Turn policy: 'black', 'white', 'left', 'right', 'minority', 'majority'
- `options.turdSize?: number` - Suppress speckles of up to this size (default: 2)
- `options.optCurve?: boolean` - Optimize curves (default: true)
- `options.alphaMax?: number` - Corner threshold (default: 1.0)

### `extractText(config: OCRConfig): Promise<OCRResult>`

Extracts text from images using Tesseract OCR.

**Config Options:**
- `inputPath: string` - Path to input image
- `language?: string` - OCR language (default: 'eng')
- `options?: object` - Tesseract configuration options

### `recognizeFont(config: FontConfig): Promise<FontResult>`

Identifies fonts in images (requires API key).

**Config Options:**
- `inputPath: string` - Path to input image
- `apiKey?: string` - Font recognition API key
- `provider?: 'whatthefont' | 'custom'` - Font recognition service

### `explodeSVG(config: ExplodeConfig): Promise<ExplodeResult>`

Combined operation: vectorize + OCR + font recognition.

## Environment Variables

```env
# Optional: Font recognition API key
FONT_RECOGNITION_API_KEY=your_api_key_here

# Optional: Custom font recognition endpoint
FONT_RECOGNITION_ENDPOINT=https://api.example.com/fonts
```

## Development

```bash
# Watch mode
npm run dev

# Build
npm run build

# Test
npm run test
```

## Dependencies

- **potrace** - Image vectorization
- **tesseract.js** - OCR engine
- **sharp** - Image processing
- **opentype.js** - Font parsing and analysis

## Integration with Reave

This plugin is designed to be installed separately and not included in the main Reave repository. To use in your Reave project:

1. Install the plugin as a local dependency or from npm
2. Import functions in your API routes or server-side code
3. Never commit this plugin to the main Reave repository

## License

Private - Internal use only
