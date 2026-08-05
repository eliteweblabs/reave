/**
 * Request-scoped active demo suite (from cookie or default).
 * Set in middleware on demo installs so hasFeature() reflects URL params.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { DemoSuiteConfig } from './demoSuite';

export const demoSuiteContext = new AsyncLocalStorage<DemoSuiteConfig>();

export function getActiveDemoSuite(): DemoSuiteConfig | undefined {
  return demoSuiteContext.getStore();
}

export function runWithDemoSuite<T>(suite: DemoSuiteConfig, fn: () => T): T {
  return demoSuiteContext.run(suite, fn);
}
