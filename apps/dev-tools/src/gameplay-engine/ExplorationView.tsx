import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ExplorationSetup } from "./ExplorationSetup";
import { IsometricLocationExploration } from "./IsometricLocationExploration";
import { useJobs } from "../jobs/useJobs";
import { fetchExplorationManifest, type ExplorationLaunchConfig } from "./explorationSupport";

export function ExplorationView() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [phase, setPhase] = useState<"setup" | "active">("setup");
    const [activeSession, setActiveSession] = useState<ExplorationLaunchConfig | null>(null);
    const { getJobDetail } = useJobs();
    const openedManifestRef = useRef<string | null>(null);
    const activeTab = searchParams.get("explorationTab") === "world" ? "world" : "location";

    const handleStartExploration = (session: ExplorationLaunchConfig) => {
        setActiveSession(session);
        setPhase("active");
    };

    const handleExit = () => {
        setPhase("setup");
        setActiveSession(null);
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
                const [descriptor, detail] = await Promise.all([
                    fetchExplorationManifest(worldId, locationId),
                    jobId ? getJobDetail(jobId) : Promise.resolve(null),
                ]);
                if (cancelled || !descriptor) return;

                const metadata = detail?.metadata || {};
                const restorePayload = typeof metadata.restore === "object" && metadata.restore && typeof (metadata.restore as { payload?: unknown }).payload === "object"
                    ? (metadata.restore as { payload?: Record<string, unknown> }).payload || {}
                    : {};
                const selectedCharIds = Array.isArray(metadata.selectedCharIds)
                    ? metadata.selectedCharIds.filter((value): value is string => typeof value === "string")
                    : Array.isArray(restorePayload.selectedCharIds)
                        ? restorePayload.selectedCharIds.filter((value): value is string => typeof value === "string")
                        : [];

                handleStartExploration({
                    worldId,
                    locationId,
                    selectedCharIds,
                    jobId,
                });
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
                        activeSession && (
                            <IsometricLocationExploration
                                session={activeSession}
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
