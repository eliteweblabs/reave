export type UsPlace = {
    n: string;
    s: string;
    lat: number;
    lng: number;
    p: number;
};
export type ServiceAreaConfig = {
    centerLat: number;
    centerLng: number;
    /** Travel radius from company office (default 30). */
    radiusMiles?: number;
    /** Keep the most populous fraction of municipalities in radius (default 0.5). */
    topPercent?: number;
};
export type ServiceAreaMunicipality = {
    cityKey: string;
    name: string;
    state: string;
    population: number;
    distanceMiles: number;
    hasViolationFeed: boolean;
};
export declare function resolveServiceAreaMunicipalities(config: ServiceAreaConfig, feedCityKeys: ReadonlySet<string>): ServiceAreaMunicipality[];
export declare function isCityInServiceArea(city: string | undefined, state: string | undefined, serviceArea: ServiceAreaMunicipality[]): boolean;
//# sourceMappingURL=places.d.ts.map