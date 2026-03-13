import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LocationExploration } from "./LocationExploration";
import { ExplorationSetup } from "./ExplorationSetup";
import { ExplorationMap } from "@ashtrail/core";
import { useJobs } from "../jobs/useJobs";
import { attachSelectedPawns, fetchExplorationManifest } from "./explorationSupport";

export function ExplorationView() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [phase, setPhase] = useState<"setup" | "active">("setup");
    const [activeMap, setActiveMap] = useState<ExplorationMap | null>(null);
    const [selectedPawnId, setSelectedPawnId] = useState<string | null>(null);
    const { getJobDetail } = useJobs();
    const openedManifestRef = useRef<string | null>(null);
    const activeTab = searchParams.get("explorationTab") === "world" ? "world" : "location";

    const handleStartExploration = (map: ExplorationMap, pawnId: string | null) => {
        setActiveMap(map);
        setSelectedPawnId(pawnId);
        setPhase("active");
    };

    const handleExit = () => {
        setPhase("setup");
        setActiveMap(null);
        setSelectedPawnId(null);
        const next = new URLSearchParams(searchParams);
        next.delete("mode");
        next.delete("jobId");
        setSearchParams(next);
    };

    useEffect(() => {
        const mode = searchParams.get("mode");
        const worldId = searchParams.get("worldId");
        const locationId = searchParams.get("locationId");
        const jobId = searchParams.get("jobId");
        if (mode !== "manifest" || !worldId || !locationId) {
            openedManifestRef.current = null;
            return;
        }

        const manifestKey = `${worldId}:${locationId}:${jobId || ""}`;
        if (openedManifestRef.current === manifestKey) {
            return;
        }
        openedManifestRef.current = manifestKey;

        let cancelled = false;
        const openManifest = async () => {
            try {
                const [manifest, detail] = await Promise.all([
                    fetchExplorationManifest(worldId, locationId),
                    jobId ? getJobDetail(jobId) : Promise.resolve(null),
                ]);
                if (cancelled || !manifest) return;

                const metadata = detail?.metadata || {};
                const restorePayload = typeof metadata.restore === "object" && metadata.restore && typeof (metadata.restore as { payload?: unknown }).payload === "object"
                    ? (metadata.restore as { payload?: Record<string, unknown> }).payload || {}
                    : {};
                const selectedCharIds = Array.isArray(metadata.selectedCharIds)
                    ? metadata.selectedCharIds.filter((value): value is string => typeof value === "string")
                    : Array.isArray(restorePayload.selectedCharIds)
                        ? restorePayload.selectedCharIds.filter((value): value is string => typeof value === "string")
                        : [];

                const { map, selectedPawnId } = attachSelectedPawns(manifest, selectedCharIds);
                handleStartExploration(map, selectedPawnId);
            } catch (error) {
                console.error("Failed to open exploration manifest", error);
            }
        };

        void openManifest();
        return () => {
            cancelled = true;
        };
    }, [getJobDetail, searchParams]);

    return (
        <div className="w-full h-full min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 bg-[#121212]/50 rounded-2xl border border-white/5 overflow-hidden">
                {activeTab === "location" ? (
                    phase === "setup" ? (
                        <ExplorationSetup onStart={handleStartExploration} />
                    ) : (
                        activeMap && (
                            <LocationExploration
                                initialMap={activeMap}
                                initialSelectedPawnId={selectedPawnId}
                                onExit={handleExit}
                            />
                        )
                    )
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold tracking-widest text-[10px]">
                        WORLD EXPLORATION IS COMING SOON...
                    </div>
                )}
            </div>
        </div>
    );
}
