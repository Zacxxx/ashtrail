import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "ashtrail_active_world_id";

export function useActiveWorld() {
    const [activeWorldId, setActiveWorldId] = useState<string | null>(() => {
        return localStorage.getItem(STORAGE_KEY);
    });

    const updateActiveWorldId = useCallback((id: string | null) => {
        setActiveWorldId(id);
        if (id) {
            localStorage.setItem(STORAGE_KEY, id);
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    }, []);

    return {
        activeWorldId,
        setActiveWorldId: updateActiveWorldId
    };
}
