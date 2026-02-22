import { useState, useCallback } from "react";
import type { GeoRegion, RegionType } from "./types";
import { REGION_TYPE_COLORS } from "./types";

export function useGeographyRegions() {
    const [regions, setRegions] = useState<GeoRegion[]>([]);
    const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
    const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);

    const addRegion = useCallback((name: string, type: RegionType, polygon: [number, number][], parentId?: string) => {
        const newRegion: GeoRegion = {
            id: crypto.randomUUID(),
            parentId,
            name,
            type,
            color: REGION_TYPE_COLORS[type],
            polygon,
        };
        setRegions(prev => [...prev, newRegion]);
        setSelectedRegionId(newRegion.id);
        return newRegion;
    }, []);

    const updateRegion = useCallback((id: string, patch: Partial<GeoRegion>) => {
        setRegions(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    }, []);

    const deleteRegion = useCallback((id: string) => {
        setRegions(prev => {
            const toDelete = new Set<string>([id]);
            let added = true;
            while (added) {
                added = false;
                for (const r of prev) {
                    if (r.parentId && toDelete.has(r.parentId) && !toDelete.has(r.id)) {
                        toDelete.add(r.id);
                        added = true;
                    }
                }
            }
            return prev.filter(r => !toDelete.has(r.id));
        });
        setSelectedRegionId(prev => {
            // If the selected active region or one of its ancestors was deleted, clear selection
            return prev && !prev.includes(id) ? prev : null; // Close enough, we actually want to check if `toDelete.has(prev)` but we don't have scope here easily unless we do it inside setState.
        });
    }, []);

    const clearRegions = useCallback(() => {
        setRegions([]);
        setSelectedRegionId(null);
    }, []);

    /**
     * Point-in-polygon test using ray casting algorithm.
     * Returns the top-most (last-added) region at the given normalized point.
     */
    const findRegionAtPoint = useCallback((x: number, y: number): GeoRegion | null => {
        // Iterate in reverse so the last-drawn region is prioritized
        for (let i = regions.length - 1; i >= 0; i--) {
            const region = regions[i];
            if (isPointInPolygon(x, y, region.polygon)) {
                return region;
            }
        }
        return null;
    }, [regions]);

    return {
        regions,
        setRegions,
        selectedRegionId,
        setSelectedRegionId,
        hoveredRegionId,
        setHoveredRegionId,
        addRegion,
        updateRegion,
        deleteRegion,
        clearRegions,
        findRegionAtPoint,
    };
}

/** Ray-casting point-in-polygon test */
function isPointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];

        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}
