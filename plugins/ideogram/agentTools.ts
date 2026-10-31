/**
 * Agent tool module: generate_image (Ideogram).
 *
 * Feature-gated via `ideogram` + IDEOGRAM_API_KEY (plugin `configured`).
 */

import {
  formatIdeogramGenerateResult,
  ideogramGenerateImages,
  isIdeogramConfigured,
} from '../../src/lib/ideogramClient';
import { hasIdeogramImageGen } from '../../src/lib/features';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

async function handle_generate_image(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  if (!isIdeogramConfigured()) {
    return JSON.stringify({ error: 'IDEOGRAM_API_KEY is not set on this service' });
  }

  const prompt = String(args.prompt ?? '').trim();
  if (!prompt) return JSON.stringify({ error: 'prompt is required' });

  const style = args.style ? String(args.style).trim() : undefined;
  const aspectRatio = args.aspect_ratio ? String(args.aspect_ratio).trim() : undefined;
  const numImages = args.num_images != null ? Number(args.num_images) : undefined;

  const result = await ideogramGenerateImages({
    prompt,
    aspectRatio,
    styleType: style,
    numImages: Number.isFinite(numImages) ? numImages : undefined,
  });

  if (!result.ok) {
    return JSON.stringify({
      error: result.error,
      status: result.status,
      detail: result.detail,
    });
  }

  return formatIdeogramGenerateResult(result);
}

export const ideogramAgentTools: AgentToolModule = {
  id: 'ideogram',
  enabled: () => hasIdeogramImageGen() && isIdeogramConfigured(),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'generate_image',
          description:
            'Generate AI images via Ideogram (Ideogram 3). Returns temporary image URLs — download or upload to the media library for a permanent link. Requires the ideogram module and IDEOGRAM_API_KEY.',
          parameters: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description:
                  'Detailed description of the image to generate — style, composition, mood, and subject.',
              },
              style: {
                type: 'string',
                description:
                  'Optional style: realistic, design, fiction, stylized, general, auto (legacy aliases REALISTIC, DESIGN, ILLUSTRATION also work).',
              },
              aspect_ratio: {
                type: 'string',
                description:
                  'Optional aspect ratio: 1x1 (default), 16x9, 9x16, 4x3, 3x4, etc. Colon form (16:9) is accepted.',
              },
              num_images: {
                type: 'number',
                description: 'Number of variations to generate (1–8, default 1).',
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
