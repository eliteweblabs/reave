/**
 * Basic test suite for SVG operations plugin
 */

import { promises as fs } from 'fs';
import path from 'path';
import { traceSVG, extractText, recognizeFont, explodeSVG } from '../src/index.js';

const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures');
const OUTPUT_DIR = path.join(import.meta.dirname, 'output');

async function setup() {
  // Create test directories
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  
  console.log('Test setup complete');
}

async function testTraceSVG() {
  console.log('\n--- Testing SVG Tracing ---');
  
  try {
    // Note: You need to add a test image to test/fixtures/
    const testImage = path.join(FIXTURES_DIR, 'test-image.png');
    
    try {
      await fs.access(testImage);
    } catch {
      console.log('⚠️  No test image found. Create test/fixtures/test-image.png to run this test.');
      return;
    }

    const result = await traceSVG({
      inputPath: testImage,
      outputPath: path.join(OUTPUT_DIR, 'traced.svg'),
      options: {
        threshold: 128,
        turnPolicy: 'minority'
      }
    });

    console.log('✓ SVG traced successfully');
    console.log(`  - Output: ${result.svgPath}`);
    console.log(`  - Dimensions: ${result.width}x${result.height}`);
    console.log(`  - Paths: ${result.pathCount}`);
    console.log(`  - Size: ${(result.fileSize / 1024).toFixed(2)} KB`);
  } catch (error) {
    console.error('✗ SVG tracing failed:', error);
  }
}

async function testOCR() {
  console.log('\n--- Testing OCR ---');
  
  try {
    const testImage = path.join(FIXTURES_DIR, 'test-text.png');
    
    try {
      await fs.access(testImage);
    } catch {
      console.log('⚠️  No test image found. Create test/fixtures/test-text.png to run this test.');
      return;
    }

    const result = await extractText({
      inputPath: testImage,
      language: 'eng'
    });

    console.log('✓ OCR completed successfully');
    console.log(`  - Text: "${result.text.substring(0, 50)}${result.text.length > 50 ? '...' : ''}"`);
    console.log(`  - Confidence: ${result.confidence.toFixed(1)}%`);
    console.log(`  - Words extracted: ${result.words.length}`);
  } catch (error) {
    console.error('✗ OCR failed:', error);
  }
}

async function testFontRecognition() {
  console.log('\n--- Testing Font Recognition ---');
  
  try {
    const testImage = path.join(FIXTURES_DIR, 'test-font.png');
    
    try {
      await fs.access(testImage);
    } catch {
      console.log('⚠️  No test image found. Create test/fixtures/test-font.png to run this test.');
      return;
    }

    const result = await recognizeFont({
      inputPath: testImage
    });

    console.log('✓ Font recognition completed');
    console.log(`  - Fonts detected: ${result.fonts.length}`);
    if (result.primaryFont) {
      console.log(`  - Primary font: ${result.primaryFont.name}`);
      console.log(`  - Confidence: ${(result.primaryFont.confidence * 100).toFixed(1)}%`);
    }
  } catch (error) {
    console.error('✗ Font recognition failed:', error);
  }
}

async function testExplode() {
  console.log('\n--- Testing Explode (Combined) ---');
  
  try {
    const testImage = path.join(FIXTURES_DIR, 'test-combined.png');
    
    try {
      await fs.access(testImage);
    } catch {
      console.log('⚠️  No test image found. Create test/fixtures/test-combined.png to run this test.');
      return;
    }

    const result = await explodeSVG({
      inputPath: testImage,
      outputDir: path.join(OUTPUT_DIR, 'exploded'),
      options: {
        vectorize: true,
        ocr: true,
        fontRecognition: true
      }
    });

    console.log('✓ Explode operation completed');
    console.log('  Output files:', Object.keys(result.outputFiles).join(', '));
    
    if (result.svg) {
      console.log(`  - SVG: ${result.svg.pathCount} paths`);
    }
    if (result.text) {
      console.log(`  - Text: ${result.text.words.length} words`);
    }
    if (result.fonts) {
      console.log(`  - Fonts: ${result.fonts.fonts.length} detected`);
    }
  } catch (error) {
    console.error('✗ Explode operation failed:', error);
  }
}

async function cleanup() {
  console.log('\n--- Test Cleanup ---');
  console.log('Test outputs saved in:', OUTPUT_DIR);
}

// Run tests
async function runTests() {
  console.log('=== SVG Operations Plugin Tests ===');
  
  await setup();
  await testTraceSVG();
  await testOCR();
  await testFontRecognition();
  await testExplode();
  await cleanup();
  
  console.log('\n=== Tests Complete ===');
}

runTests().catch(console.error);
