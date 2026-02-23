import { useState, useCallback, useEffect } from "react";
import type { TerrainCell } from "../modules/geo/types";
import type { PlanetWorld } from "./types";

export type CellFeatureMap = Record<string, { subTiles: any[] }>;

export function useGeographyCells(
    activeHistoryId: string | null,
    globeWorld: PlanetWorld | null,
    setGlobeWorld: React.Dispatch<React.SetStateAction<PlanetWorld | null>>
) {
    const [cellFeatures, setCellFeatures] = useState<CellFeatureMap>({});
    const [isLoaded, setIsLoaded] = useState<boolean>(false);

    // Load cell features from backend when history ID changes
    useEffect(() => {
        if (!activeHistoryId || !globeWorld) {
            setCellFeatures({});
            setIsLoaded(false);
            return;
        }

        let isMounted = true;
        setIsLoaded(false);

        fetch(`/api/planet/cells/${activeHistoryId}`)
            .then(res => {
                if (!res.ok) throw new Error("Failed to fetch cell features");
                return res.json();
            })
            .then((data: CellFeatureMap) => {
                if (isMounted) {
                    setCellFeatures(data || {});
                    setIsLoaded(true);

                    // Hydrate globeWorld with stored cell features
                    setGlobeWorld(prev => {
                        if (!prev) return prev;
                        const newCellData = prev.cellData.map(cell => {
                            const id = `${cell.x},${cell.y}`;
                            if (data && data[id]) {
                                return { ...cell, subTiles: data[id].subTiles };
                            }
                            return cell;
                        });
                        return { ...prev, cellData: newCellData };
                    });
                }
            })
            .catch(err => {
                console.error("Failed to load cell features from backend", err);
                if (isMounted) {
                    setCellFeatures({});
                    setIsLoaded(true);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [activeHistoryId, globeWorld?.textureUrl]); // Only re-run when history ID or texture (planet load) changes.

    // Save cell features whenever they change
    useEffect(() => {
        if (!activeHistoryId || !isLoaded) return;

        // Skip saving if empty
        if (Object.keys(cellFeatures).length === 0) return;

        fetch(`/api/planet/cells/${activeHistoryId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cellFeatures)
        }).catch(err => {
            console.error("Failed to save cell features to backend", err);
        });
    }, [cellFeatures, activeHistoryId, isLoaded]);

    const saveCellSubTiles = useCallback((cellX: number, cellY: number, subTiles: any[]) => {
        const id = `${cellX},${cellY}`;
        setCellFeatures(prev => ({ ...prev, [id]: { subTiles } }));
    }, []);

    return {
        cellFeatures,
        saveCellSubTiles,
    };
}
