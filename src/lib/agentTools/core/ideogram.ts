/**
 * Agent tool module: generate_image
 * Generates AI images via Ideogram REST API.
 */

import type { AgentToolDef, AgentToolModule, ToolContext } from '../types';

async function handle_generate_image(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  const prompt = String(args.prompt ?? '').trim();
  if (!prompt) return JSON.stringify({ error: 'prompt is required' });

  const apiKey = process.env.IDEOGRAM_API_KEY;
  if (!apiKey) {
    return JSON.stringify({ error: 'IDEOGRAM_API_KEY is not configured' });
  }

  const style = args.style ? String(args.style).trim() : undefined;
  const aspectRatio = args.aspect_ratio ? String(args.aspect_ratio).trim() : undefined;

  try {
    const body: Record<string, unknown> = {
      image_request: {
        prompt,
        aspect_ratio: aspectRatio || '1:1',
        model: 'V_2',
      },
    };

    if (style) {
      body.image_request = {
        ...body.image_request,
        style_type: style,
      };
    }

    const response = await fetch('https://api.ideogram.ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return JSON.stringify({
        error: `Ideogram API error: ${response.status} ${response.statusText}`,
        detail: errorText,
      });
    }

    const data = (await response.json()) as Record<string, unknown>;

    // Extract image URLs from Ideogram response
    if (!data.data || typeof data.data !== 'object') {
      return JSON.stringify({
        error: 'Unexpected Ideogram API response format',
        response: data,
      });
    }

    const dataObj = data.data as Record<string, unknown>;
    const images = dataObj.images as Array<{ url: string }> | undefined;

    if (!images || images.length === 0) {
      return JSON.stringify({
        error: 'No images returned from Ideogram API',
        response: data,
      });
    }

    return JSON.stringify({
      ok: true,
      prompt,
      images: images.map((img) => ({
        url: img.url,
      })),
      count: images.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ error: `Failed to generate image: ${msg}` });
  }
}

export const ideogramModule: AgentToolModule = {
  id: 'ideogram',
  enabled: () => !!process.env.IDEOGRAM_API_KEY,
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'generate_image',
          description:
            'Generate AI-powered images via Ideogram. Describe what you want to create and receive high-quality generated images. Requires IDEOGRAM_API_KEY to be configured.',
          parameters: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description:
                  'Detailed description of the image you want to generate. Be specific about style, composition, mood, and details.',
              },
              style: {
                type: 'string',
                description:
                  'Optional style preset: REALISTIC, ILLUSTRATION, DESIGN, PAINTING, 3D, or other Ideogram style types.',
              },
              aspect_ratio: {
                type: 'string',
                description:
                  'Optional aspect ratio. Common values: 1:1 (square, default), 16:9 (wide), 9:16 (portrait), 4:3, 3:4, etc.',
              },
            },
            required: ['prompt'],
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    generate_image: handle_generate_image,
  },
};
