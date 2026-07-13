/**
 * Runtime validation for deck scripts (hand-edit safe).
 * No Zod dependency — plain TypeScript guards.
 */
import type {
  DeckAction,
  DeckFeature,
  DeckScript,
  DeckSection,
  DeckSurface,
} from './types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isSurface(v: unknown): v is DeckSurface {
  return v === 'phone' || v === 'desktop';
}

function isDevice(v: unknown): boolean {
  return (
    v === 'phone-hand' ||
    v === 'phone-desk' ||
    v === 'laptop' ||
    v === 'tablet'
  );
}

function validateAction(raw: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    errors.push(`${path}: action must be an object`);
    return errors;
  }
  const type = raw.type;
  if (typeof type !== 'string') {
    errors.push(`${path}: missing type`);
    return errors;
  }
  switch (type) {
    case 'stage.set':
      if (!isSurface(raw.surface)) {
        errors.push(`${path}: surface must be "phone" | "desktop"`);
      }
      if (raw.device !== undefined && !isDevice(raw.device)) {
        errors.push(
          `${path}: device must be "phone-hand" | "phone-desk" | "laptop" | "tablet"`,
        );
      }
      if (raw.url !== undefined && typeof raw.url !== 'string') {
        errors.push(`${path}: url must be a string`);
      }
      if (raw.html !== undefined && typeof raw.html !== 'string') {
        errors.push(`${path}: html must be a string`);
      }
      if (raw.gif !== undefined && typeof raw.gif !== 'string') {
        errors.push(`${path}: gif must be a string`);
      }
      if (raw.url === undefined && raw.html === undefined && raw.gif === undefined) {
        errors.push(`${path}: stage.set requires gif, url, or html`);
      }
      break;
    case 'stage.highlight':
      if (typeof raw.selector !== 'string' || !raw.selector.trim()) {
        errors.push(`${path}: selector must be a non-empty string`);
      }
      break;
    case 'stage.caption':
      if (typeof raw.text !== 'string') {
        errors.push(`${path}: text must be a string`);
      }
      break;
    case 'nav.pulse':
      if (typeof raw.tab !== 'string' || !raw.tab.trim()) {
        errors.push(`${path}: tab must be a non-empty string`);
      }
      break;
    case 'wait':
      if (typeof raw.ms !== 'number' || !Number.isFinite(raw.ms) || raw.ms < 0) {
        errors.push(`${path}: ms must be a non-negative number`);
      }
      break;
    default:
      errors.push(`${path}: unknown action type "${type}"`);
  }
  return errors;
}

function validateFeature(raw: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    errors.push(`${path}: feature must be an object`);
    return errors;
  }
  if (typeof raw.id !== 'string' || !raw.id.trim()) {
    errors.push(`${path}: id required`);
  }
  if (typeof raw.title !== 'string' || !raw.title.trim()) {
    errors.push(`${path}: title required`);
  }
  if (typeof raw.body !== 'string') {
    errors.push(`${path}: body must be a string`);
  }
  if (raw.scrollHeight !== undefined) {
    if (typeof raw.scrollHeight !== 'number' || raw.scrollHeight <= 0) {
      errors.push(`${path}: scrollHeight must be a positive number`);
    }
  }
  if (!Array.isArray(raw.actions)) {
    errors.push(`${path}: actions must be an array`);
  } else {
    raw.actions.forEach((a, i) => {
      errors.push(...validateAction(a, `${path}.actions[${i}]`));
    });
  }
  return errors;
}

function validateSection(raw: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    errors.push(`${path}: section must be an object`);
    return errors;
  }
  if (typeof raw.id !== 'string' || !raw.id.trim()) {
    errors.push(`${path}: id required`);
  }
  if (typeof raw.title !== 'string' || !raw.title.trim()) {
    errors.push(`${path}: title required`);
  }
  if (raw.summary !== undefined && typeof raw.summary !== 'string') {
    errors.push(`${path}: summary must be a string`);
  }
  if (raw.optional !== undefined && typeof raw.optional !== 'boolean') {
    errors.push(`${path}: optional must be a boolean`);
  }
  if (raw.quoteLabel !== undefined && typeof raw.quoteLabel !== 'string') {
    errors.push(`${path}: quoteLabel must be a string`);
  }
  if (raw.video !== undefined && typeof raw.video !== 'string') {
    errors.push(`${path}: video must be a string`);
  }
  if (
    raw.videoEnter !== undefined &&
    raw.videoEnter !== 'left' &&
    raw.videoEnter !== 'right' &&
    raw.videoEnter !== 'up' &&
    raw.videoEnter !== 'down'
  ) {
    errors.push(`${path}: videoEnter must be "left" | "right" | "up" | "down"`);
  }
  if (!Array.isArray(raw.features) || raw.features.length === 0) {
    errors.push(`${path}: features must be a non-empty array`);
  } else {
    raw.features.forEach((f, i) => {
      errors.push(...validateFeature(f, `${path}.features[${i}]`));
    });
  }
  return errors;
}

export type DeckValidateResult =
  | { ok: true; script: DeckScript }
  | { ok: false; errors: string[] };

/** Validate unknown JSON into a DeckScript. */
export function validateDeckScript(raw: unknown): DeckValidateResult {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: ['root: must be an object'] };
  }
  if (typeof raw.id !== 'string' || !raw.id.trim()) {
    errors.push('id: required');
  }
  if (typeof raw.title !== 'string' || !raw.title.trim()) {
    errors.push('title: required');
  }
  if (raw.preset !== undefined && typeof raw.preset !== 'string') {
    errors.push('preset: must be a string');
  }
  if (!Array.isArray(raw.sections) || raw.sections.length === 0) {
    errors.push('sections: must be a non-empty array');
  } else {
    raw.sections.forEach((s, i) => {
      errors.push(...validateSection(s, `sections[${i}]`));
    });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, script: raw as unknown as DeckScript };
}

/** Assert valid; throws with joined errors. */
export function assertDeckScript(raw: unknown): DeckScript {
  const result = validateDeckScript(raw);
  if (!result.ok) {
    throw new Error(`Invalid deck script:\n${result.errors.join('\n')}`);
  }
  return result.script;
}

/** Type helpers for authors — re-export action shape checks. */
export function isDeckAction(raw: unknown): raw is DeckAction {
  return validateAction(raw, 'action').length === 0;
}

export function isDeckFeature(raw: unknown): raw is DeckFeature {
  return validateFeature(raw, 'feature').length === 0;
}

export function isDeckSection(raw: unknown): raw is DeckSection {
  return validateSection(raw, 'section').length === 0;
}
