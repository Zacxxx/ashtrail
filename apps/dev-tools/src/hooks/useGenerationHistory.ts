import { useState, useEffect, useCallback } from "react";
import type { SimulationConfig } from "../modules/geo/types";

export interface GenerationHistoryItem {
    id: string;            // The job ID or UUID
    timestamp: number;     // When it was generated
    prompt: string;        // The user's text prompt
    config: SimulationConfig; // All the simulation sliders
    textureUrl: string;    // Base64 object URL of the final image mapping
    thumbnailUrl?: string; // Smaller version for gallery
    isUpscaled?: boolean;  // True if generated via ESRGAN
    parentId?: string;     // History ID of the original non-upscaled map
}

const API_URL = "/api/history";

export function useGenerationHistory() {
    const [history, setHistory] = useState<GenerationHistoryItem[]>([]);
    const [isReady, setIsReady] = useState(false);

    const loadHistory = useCallback(async () => {
        try {
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error("Failed to fetch history");
            let items: GenerationHistoryItem[] = await res.json();
            items.sort((a, b) => b.timestamp - a.timestamp);
            setHistory(items);
        } catch (e) {
            console.error("History load error:", e);
        } finally {
            setIsReady(true);
        }
    }, []);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    const saveToHistory = useCallback(async (item: GenerationHistoryItem) => {
        try {
            const res = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(item)
            });
            if (res.ok) {
                // Instantly update local state to avoid refetching 50MB of base64s right after generating it
                setHistory(prev => {
                    let newHistory = [item, ...prev.filter(i => i.id !== item.id)];
                    newHistory.sort((a, b) => b.timestamp - a.timestamp);
                    if (newHistory.length > 5) {
                        newHistory = newHistory.slice(0, 5);
                    }
                    return newHistory;
                });
            }
        } catch (e) {
            console.error("Save history error:", e);
        }
    }, []);

    const deleteFromHistory = useCallback(async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
            if (res.ok) {
                setHistory(prev => prev.filter(i => i.id !== id));
            }
        } catch (e) {
            console.error("Delete history error:", e);
        }
    }, []);

    const clearHistory = useCallback(async () => {
        try {
            const res = await fetch(API_URL, { method: "DELETE" });
            if (res.ok) {
                setHistory([]);
            }
        } catch (e) {
            console.error("Clear history error:", e);
        }
    }, []);

    return {
        history,
        isReady,
        saveToHistory,
        deleteFromHistory,
        clearHistory
    };
}
