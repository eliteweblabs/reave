/**
 * Lightweight structured logger for the Node SSR server.
 *
 * - Levels: debug < info < warn < error (filter with LOG_LEVEL)
 * - Dev: human-readable lines to stdout/stderr
 * - Production: one JSON object per line (Railway / log aggregators)
 *
 * Usage:
 *   import { createLogger } from './logger';
 *   const log = createLogger('email-inbox');
 *   log.info('message appended', { id });
 *   log.error('pg list failed', err);
 */

import { serverEnv } from './serverEnv';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogMeta {
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, metaOrError?: LogMeta | Error): void;
  child(bindings: { component: string }): Logger;
}

let cachedMinLevel: LogLevel | null = null;

function isProduction(): boolean {
  return Boolean(import.meta.env.PROD);
}

function parseLogLevel(raw: string | undefined): LogLevel | null {
  const level = raw?.trim().toLowerCase();
  if (level === 'debug' || level === 'info' || level === 'warn' || level === 'error') {
    return level;
  }
  return null;
}

/** Minimum level emitted. LOG_LEVEL env overrides; default debug in dev, info in prod. */
export function getLogLevel(): LogLevel {
  if (cachedMinLevel) return cachedMinLevel;
  cachedMinLevel = parseLogLevel(serverEnv('LOG_LEVEL')) ?? (isProduction() ? 'info' : 'debug');
  return cachedMinLevel;
}

/** Reset cached level (tests / hot reload). */
export function resetLogLevelCache(): void {
  cachedMinLevel = null;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[getLogLevel()];
}

function normalizeError(metaOrError?: LogMeta | Error): LogMeta | undefined {
  if (!metaOrError) return undefined;
  if (metaOrError instanceof Error) {
    return {
      error: metaOrError.message,
      ...(metaOrError.stack ? { stack: metaOrError.stack } : {}),
      ...(metaOrError.name && metaOrError.name !== 'Error' ? { errorName: metaOrError.name } : {}),
    };
  }
  return metaOrError;
}

function write(level: LogLevel, component: string, message: string, meta?: LogMeta): void {
  if (!shouldLog(level)) return;

  const time = new Date().toISOString();

  if (isProduction()) {
    const payload: Record<string, unknown> = {
      time,
      level,
      component,
      msg: message,
    };
    if (meta && Object.keys(meta).length > 0) payload.meta = meta;
    const line = JSON.stringify(payload);
    if (level === 'error' || level === 'warn') {
      console.error(line);
    } else {
      console.log(line);
    }
    return;
  }

  const prefix = `[${component}]`;
  const hasMeta = meta && Object.keys(meta).length > 0;
  const args: unknown[] = hasMeta ? [prefix, message, meta] : [prefix, message];

  switch (level) {
    case 'error':
      console.error(...args);
      break;
    case 'warn':
      console.warn(...args);
      break;
    case 'debug':
      console.debug(...args);
      break;
    default:
      console.log(...args);
  }
}

function makeLogger(component: string): Logger {
  return {
    debug(message, meta) {
      write('debug', component, message, meta);
    },
    info(message, meta) {
      write('info', component, message, meta);
    },
    warn(message, meta) {
      write('warn', component, message, meta);
    },
    error(message, metaOrError) {
      write('error', component, message, normalizeError(metaOrError));
    },
    child(bindings) {
      return makeLogger(bindings.component);
    },
  };
}

/** Create a namespaced logger. Component appears in every line (e.g. `email-inbox`). */
export function createLogger(component: string): Logger {
  const name = component.trim();
  return makeLogger(name || 'app');
}

/** Root logger when no component namespace is needed. */
export const log = createLogger('app');
