import type { ViolationsProvider } from './types.js';
/** Mock violations — empty by default; demo address has one open item. */
export declare const mockViolationsProvider: ViolationsProvider;
export declare function lookupViolations(input: {
    address: string;
    city?: string;
    state?: string;
    zip?: string;
}): Promise<import('./types.js').ViolationLookupResult>;
//# sourceMappingURL=index.d.ts.map