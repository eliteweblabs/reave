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
export type ScanConfig = {
    centerLat: number;
    centerLng: number;
    radiusMiles: number;
    trades: TradeSlug[];
    maxResults?: number;
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