# Plugins Directory

This directory contains custom plugins that are specific to this deployment and not part of the core Reave platform.

## Why Separate Plugins?

Plugins in this directory are:
- Specific to particular use cases or clients
- Not intended for all Reave installations
- Maintained separately from the core platform
- Can be excluded from deployments where not needed

## Available Plugins

### svg-operations

Image processing plugin for SVG tracing, OCR, and font recognition.

**Use cases:**
- Converting raster images to vector SVG
- Extracting text from images
- Identifying fonts in designs

**Installation:**
```bash
cd plugins/svg-operations
npm install
npm run build
```

See [svg-operations/README.md](./svg-operations/README.md) for full documentation.

## Creating New Plugins

To create a new plugin:

1. Create a new directory under `plugins/`
2. Initialize with `npm init` or copy the structure from an existing plugin
3. Add a README.md with usage instructions
4. Keep dependencies isolated within the plugin directory
5. Update this file with a brief description

## Integration

Plugins can be integrated into the main Reave application by:
- Importing as local packages
- Using as API microservices
- Loading dynamically at runtime

The integration method depends on the specific plugin requirements.
