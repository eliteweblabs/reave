/**
 * Grand opening conversational form — field order and registrar branch must reach email.
 * Run: npm run check:grand-opening-form
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type FormField = {
  name: string;
  type?: string;
  required?: boolean;
  'cf-show-if'?: string;
  'cf-show-if-value'?: string;
};

type FormDef = {
  fields: FormField[];
};

const form = JSON.parse(readFileSync('public/forms/grand-opening.json', 'utf8')) as FormDef;

function fieldShouldShow(field: FormField, data: Record<string, string>): boolean {
  const cond = field['cf-show-if'];
  if (!cond) return true;
  if (cond === 'phone') return Boolean(String(data.phone || '').trim());
  const expected = field['cf-show-if-value'];
  const value = data[cond];
  if (expected !== undefined && expected !== null && expected !== '') {
    return String(value || '') === String(expected);
  }
  return Boolean(String(value || '').trim());
}

function visibleFieldNames(data: Record<string, string>): string[] {
  return form.fields.filter((f) => fieldShouldShow(f, data)).map((f) => f.name);
}

function nextIndexAfter(data: Record<string, string>, fromName: string): string | null {
  const start = form.fields.findIndex((f) => f.name === fromName);
  assert.ok(start >= 0, `missing field ${fromName}`);
  for (let i = start + 1; i < form.fields.length; i++) {
    const field = form.fields[i];
    if (fieldShouldShow(field, data)) return field.name;
  }
  return null;
}

const yesWebsite = {
  has_website: 'yes',
  website: 'example.com',
  registrar: 'Network Solutions, LLC',
};

assert.equal(nextIndexAfter(yesWebsite, 'website'), 'registrar_access');

assert.equal(
  nextIndexAfter({ ...yesWebsite, registrar_access: 'unsure' }, 'registrar_access'),
  'email',
  'unsure registrar path must go straight to email (no dead-end on login fields)',
);

assert.equal(
  nextIndexAfter({ ...yesWebsite, registrar_access: 'no' }, 'registrar_access'),
  'email',
);

assert.equal(
  nextIndexAfter({ ...yesWebsite, registrar_access: 'yes' }, 'registrar_access'),
  'registrar_username',
);

assert.equal(
  nextIndexAfter({ ...yesWebsite, registrar_access: 'yes', registrar_username: 'a@b.com' }, 'registrar_username'),
  'registrar_password',
);

const emailIdx = form.fields.findIndex((f) => f.name === 'email');
const nameIdx = form.fields.findIndex((f) => f.name === 'name');
assert.ok(emailIdx >= 0 && nameIdx >= 0, 'email and name fields exist');
assert.ok(emailIdx < nameIdx, 'email must come before optional name for lead capture');

const emailField = form.fields[emailIdx];
assert.equal(emailField.required, true);

const noWebsite = { has_website: 'no', business_stage: 'current' };
const noPath = visibleFieldNames(noWebsite);
assert.ok(noPath.includes('business_name'));
assert.ok(noPath.includes('email'));
assert.ok(!noPath.includes('registrar_access'));

console.log('verify-grand-opening-form: ok');
