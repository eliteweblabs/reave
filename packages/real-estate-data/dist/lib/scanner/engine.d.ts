import type { PropertyRecord } from '../providers/types.js';
import { type TradeSlug } from '../trades.js';
export type ScanCandidate = PropertyRecord & {
    lat: number;
    lng: number;
    distanceMiles: number;
    leadScore: number;
    leadReasons: string[];
    matchedTrades: TradeSlug[];
};
export type ScanCenterLocation = {
    city: string;
    state: string;
    zip?: string;
};
export type ScanConfig = {
    centerLat: number;
    centerLng: number;
    radiusMiles: number;
    trades: TradeSlug[];
    maxResults?: number;
    /** City/state/zip for mock scan addresses — should match the scan center, not a demo locale. */
    centerLocation?: ScanCenterLocation;
};
export type ScanResult = {
    ok: true;
    scannedAt: string;
    center: {
        lat: number;
        lng: number;
    };
    radiusMiles: number;
    trades: TradeSlug[];
    candidatesFound: number;
    candidates: ScanCandidate[];
};
export declare function runRadiusScan(config: ScanConfig): ScanResult;
//# sourceMappingURL=engine.d.ts.map