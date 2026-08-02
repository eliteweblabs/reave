import type { ViolationFeedConfig } from '../registry.js';
import type { CodeViolation } from '../types.js';
type LookupInput = {
    address: string;
    city?: string;
    state?: string;
    zip?: string;
};
export declare function queryCkanFeed(feed: Extract<ViolationFeedConfig, {
    type: 'ckan';
}>, input: LookupInput): Promise<CodeViolation[]>;
export declare function querySocrataFeed(feed: Extract<ViolationFeedConfig, {
    type: 'socrata';
}>, input: LookupInput, appToken?: string): Promise<CodeViolation[]>;
export declare function queryFeed(feed: ViolationFeedConfig, input: LookupInput, appToken?: string): Promise<CodeViolation[]>;
export {};
//# sourceMappingURL=query.d.ts.map