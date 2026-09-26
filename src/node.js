// Node.js convenience: validator preloaded with the bundled official rule files.
import { readFileSync } from 'node:fs';
import { createValidator } from './validate.js';
import { skChecks } from './sk/checks.js';

const RULES_DIR = new URL('../rules/', import.meta.url);

export function loadRules(name) {
  return readFileSync(new URL(`${name}.sch`, RULES_DIR), 'utf8');
}

/** Validator with CEN + Peppol rules and Slovak checks. */
export function createNodeValidator({ sk = true } = {}) {
  return createValidator(loadRules, { extraChecks: sk ? [skChecks] : [] });
}

export * from './index.js';
