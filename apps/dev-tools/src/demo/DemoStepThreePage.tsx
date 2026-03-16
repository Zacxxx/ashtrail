import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { useGenerationHistory } from "../hooks/useGenerationHistory";
import { useActiveWorld } from "../hooks/useActiveWorld";
import { useDemoFlow } from "./DemoFlowContext";
import { useTrackedJobLauncher } from "../jobs/useTrackedJobLauncher";
import { useJobs } from "../jobs/useJobs";
import { DEMO_STEP_THREE_INTRO_LINES } from "./demoStepThree";
import { useHomepageAudio } from "./useHomepageAudio";
import { useSceneAudio } from "./useSceneAudio";

type DemoStepThreeScreenPhase = "loading" | "intro" | "ready" | "error";

type LocationGenerationStatus = "idle" | "generating" | "success" | "error";

interface GeneratedLocation {
    id: string;
    title: string;
    description: string;
    imageUrl: string | null;
    status: LocationGenerationStatus;
    error: string | null;
    expanded: boolean;
    selected: boolean;
    lat: number;
    lon: number;
}

interface PersistedDemoStepTwoArtifact {
    heroVariant: string;
    heroName: string;
    worldId?: string | null;
    worldContext: {
        worldTitle: string;
        worldLore: string;
        selectedDirectionTitle?: string | null;
    };
}

interface DemoStepThreeContext {
    heroVariant: string;
    heroName: string;
    worldId: string | null;
    worldTitle: string;
    textureUrl: string;
}

function normalizeHeroVariant(value: string | null) {
    return value === "jane" ? "jane" : "john";
}

async function loadPersistedStepTwoArtifact(stepOneJobId: string | null, heroVariant: string) {
    const params = new URLSearchParams();
    if (stepOneJobId) {
        params.set("stepOneJobId", stepOneJobId);
    }
    params.set("hero", heroVariant);
    const response = await fetch(`/api/demo/step-2/artifact?${params.toString()}`);
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Failed to load persisted demo step 2 artifact: ${response.status}`);
    }
    return await response.json() as PersistedDemoStepTwoArtifact;
}

export function DemoStepThreePage() {
    useHomepageAudio(false);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { setPlanetAsset, setPlanetView, setLocationMarkers } = useDemoFlow();
    const { history, isReady: isHistoryReady } = useGenerationHistory();
    const { activeWorldId, setActiveWorldId } = useActiveWorld();
    const launchTrackedJob = useTrackedJobLauncher();
    const { waitForJob } = useJobs();
    const [screenPhase, setScreenPhase] = useState<DemoStepThreeScreenPhase>("loading");
    const [context, setContext] = useState<DemoStepThreeContext | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [attemptKey, setAttemptKey] = useState(0);
    const [typedIntroLength, setTypedIntroLength] = useState(0);
    const [locations, setLocations] = useState<GeneratedLocation[]>([
        { id: "loc-1", title: "", description: "", imageUrl: null, status: "idle", error: null, expanded: false, selected: false, lat: 35, lon: -45 },
        { id: "loc-2", title: "", description: "", imageUrl: null, status: "idle", error: null, expanded: false, selected: false, lat: -20, lon: 60 },
        { id: "loc-3", title: "", description: "", imageUrl: null, status: "idle", error: null, expanded: false, selected: false, lat: 50, lon: 120 },
        { id: "loc-4", title: "", description: "", imageUrl: null, status: "idle", error: null, expanded: false, selected: false, lat: -40, lon: -100 },
    ]);
    const generationStartedRef = useRef(false);
    const introBody = useMemo(() => DEMO_STEP_THREE_INTRO_LINES.join("\n\n"), []);
    const stepOneJobId = searchParams.get("stepOneJobId");
    const planetTextureParam = searchParams.get("planetTexture");
    const planetTitleParam = searchParams.get("planetTitle");
    const soundtrackUrl = searchParams.get("soundtrack");
    const heroParam = searchParams.get("hero");

    useSceneAudio(soundtrackUrl, screenPhase !== "error" && Boolean(soundtrackUrl));

    useEffect(() => {
        setTypedIntroLength(0);
        generationStartedRef.current = false;
    }, [attemptKey]);

    useEffect(() => {
        if (screenPhase !== "intro") {
            return;
        }
        let cancelled = false;
        let frameHandle = 0;
        const startedAt = performance.now();
        const charactersPerSecond = 48;

        const tick = (now: number) => {
            if (cancelled) return;
            const elapsedSeconds = (now - startedAt) / 1000;
            const nextLength = Math.min(introBody.length, Math.floor(elapsedSeconds * charactersPerSecond));
            setTypedIntroLength((current) => (current === nextLength ? current : nextLength));
            if (nextLength < introBody.length) {
                frameHandle = window.requestAnimationFrame(tick);
            }
        };

        frameHandle = window.requestAnimationFrame(tick);
        return () => {
            cancelled = true;
            window.cancelAnimationFrame(frameHandle);
        };
    }, [introBody, screenPhase]);

    // Planet asset setup (without selectedLocation dependency)
    useEffect(() => {
        const textureUrl = context?.textureUrl || planetTextureParam || null;
        setPlanetAsset({
            textureUrl,
            title: context?.worldTitle || planetTitleParam || null,
        });
    }, [context?.textureUrl, context?.worldTitle, planetTextureParam, planetTitleParam, setPlanetAsset]);

    useEffect(() => {
        let cancelled = false;

        const bootstrap = async () => {
            setError(null);
            setContext(null);
            setScreenPhase("loading");

            if (!activeWorldId && !isHistoryReady) {
                return;
            }

            try {
                const requestedHero = heroParam === "john" || heroParam === "jane" ? heroParam : null;
                const heroVariantsToProbe = requestedHero ? [requestedHero] : ["john", "jane"];

                let persistedStepTwo: PersistedDemoStepTwoArtifact | null = null;
                let resolvedHeroVariant = normalizeHeroVariant(heroParam);

                for (const heroVariant of heroVariantsToProbe) {
                    const candidate = await loadPersistedStepTwoArtifact(stepOneJobId, heroVariant);
                    if (cancelled) return;
                    if (!candidate) {
                        continue;
                    }
                    persistedStepTwo = candidate;
                    resolvedHeroVariant = normalizeHeroVariant(candidate.heroVariant || heroVariant);
                    break;
                }

                if (!persistedStepTwo) {
                    throw new Error("Step 3 requires the persisted step 2 hero package.");
                }

                if (heroParam !== resolvedHeroVariant) {
                    setSearchParams((previous) => {
                        const next = new URLSearchParams(previous);
                        next.set("hero", resolvedHeroVariant);
                        return next;
                    }, { replace: true });
                }

                const resolvedWorldId = persistedStepTwo.worldId ?? activeWorldId ?? history[0]?.id ?? null;
                const historyItem = resolvedWorldId
                    ? history.find((item) => item.id === resolvedWorldId) ?? null
                    : history[0] ?? null;
                const textureUrl = planetTextureParam || historyItem?.textureUrl || null;
                if (!textureUrl) {
                    throw new Error("Planet texture unavailable for demo step 3.");
                }

                if (resolvedWorldId) {
                    setActiveWorldId(resolvedWorldId);
                }

                setContext({
                    heroVariant: resolvedHeroVariant,
                    heroName: persistedStepTwo.heroName,
                    worldId: resolvedWorldId,
                    worldTitle: persistedStepTwo.worldContext.worldTitle || planetTitleParam || "Planetfall",
                    textureUrl,
                });

                setScreenPhase("intro");
            } catch (nextError) {
                if (cancelled) return;
                setError(nextError instanceof Error ? nextError.message : "Failed to initialize demo step 3.");
                setScreenPhase("error");
            }
        };

        void bootstrap();

        return () => {
            cancelled = true;
        };
    }, [
        activeWorldId,
        attemptKey,
        heroParam,
        history,
        isHistoryReady,
        planetTextureParam,
        planetTitleParam,
        setActiveWorldId,
        setSearchParams,
        stepOneJobId,
    ]);

    const analyzeTextureForCoordinates = useCallback(async (textureUrl: string, locationTypes: Array<{ title: string; seed: string }>) => {
        // First, check if we have persisted vision coordinates
        try {
            const params = new URLSearchParams();
            if (stepOneJobId) {
                params.set("stepOneJobId", stepOneJobId);
            }
            if (context?.heroVariant) {
                params.set("hero", context.heroVariant);
            }
            
            const persistedResponse = await fetch(`/api/demo/step-3/vision-coordinates?${params.toString()}`);
            if (persistedResponse.ok) {
                const persisted = await persistedResponse.json();
                console.log('✓ Using persisted vision coordinates');
                return persisted.coordinates;
            } else if (persistedResponse.status === 404) {
                console.log('No persisted vision coordinates found, using diverse fallback coordinates');
            }
        } catch (err) {
            // Silently continue to fallback coordinates
        }

        // Use diverse fallback coordinates
        // TODO: Implement AI vision analysis when endpoint is available
        const fallbackCoordinates = [
            { lat: 35, lon: -45 },
            { lat: -20, lon: 60 },
            { lat: 50, lon: 120 },
            { lat: -40, lon: -100 },
        ];
        
        // Persist the fallback coordinates for consistency
        try {
            const params = new URLSearchParams();
            if (stepOneJobId) {
                params.set("stepOneJobId", stepOneJobId);
            }
            if (context?.heroVariant) {
                params.set("hero", context.heroVariant);
            }
            
            await fetch(`/api/demo/step-3/vision-coordinates?${params.toString()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    coordinates: fallbackCoordinates,
                    textureUrl,
                    createdAt: new Date().toISOString(),
                }),
            }).catch(err => console.warn('Failed to persist vision coordinates', err));
        } catch (err) {
            // Silently fail
        }
        
        return fallbackCoordinates;
    }, [stepOneJobId, context?.heroVariant]);

    const startLocationGeneration = useCallback(async () => {
        if (!context) return;

        // Define diverse location types that will be grounded in the world context
        const locationTypes = [
            {
                title: "Settlement Hub",
                seed: `A populated settlement that reflects the ${context.worldTitle}'s civilization and culture`,
            },
            {
                title: "Frontier Outpost",
                seed: `A remote frontier location on ${context.worldTitle} where survival and exploration intersect`,
            },
            {
                title: "Natural Wonder",
                seed: `A striking natural landmark on ${context.worldTitle} that showcases the planet's unique geography`,
            },
            {
                title: "Strategic Site",
                seed: `A location of tactical or historical importance on ${context.worldTitle}`,
            },
        ];

        // Use AI vision to analyze texture and get smart coordinates
        const smartCoordinates = await analyzeTextureForCoordinates(context.textureUrl, locationTypes);
        
        // Update locations with AI-determined coordinates
        setLocations((prev) => prev.map((loc, index) => ({
            ...loc,
            lat: smartCoordinates[index].lat,
            lon: smartCoordinates[index].lon,
        })));

        // Check for persisted locations first
        const persistedLocations = await Promise.all(
            locations.map(async (location, index) => {
                try {
                    const params = new URLSearchParams();
                    if (stepOneJobId) {
                        params.set("stepOneJobId", stepOneJobId);
                    }
                    params.set("hero", context.heroVariant);
                    params.set("nodeId", `demo-loc-${index + 1}`);
                    
                    const response = await fetch(`/api/demo/step-3/artifact?${params.toString()}`);
                    if (response.ok) {
                        const artifact = await response.json();
                        return {
                            id: location.id,
                            title: artifact.locationTitle,
                            description: artifact.briefText,
                            imageUrl: artifact.image?.url || null,
                            status: "success" as LocationGenerationStatus,
                            error: null,
                            lat: smartCoordinates[index].lat,
                            lon: smartCoordinates[index].lon,
                            expanded: false,
                            selected: false,
                        };
                    }
                } catch (err) {
                    console.log(`No persisted location for index ${index}`);
                }
                return null;
            })
        );

        // Update with persisted locations where they exist
        const hasAnyPersistedLocations = persistedLocations.some((loc) => loc !== null);
        if (hasAnyPersistedLocations) {
            setLocations((prev) => prev.map((loc, index) => {
                const persisted = persistedLocations[index];
                if (persisted) {
                    return persisted;
                }
                // Keep the location with updated coordinates but mark as idle for generation
                return {
                    ...loc,
                    lat: smartCoordinates[index].lat,
                    lon: smartCoordinates[index].lon,
                    status: "idle" as LocationGenerationStatus,
                };
            }));
        }

        // Generate missing locations in an interleaved manner
        const locationPromises = locations.map(async (location, index) => {
            // Skip if already persisted
            if (persistedLocations[index]) {
                console.log(`Location ${index + 1} already exists, skipping generation`);
                return;
            }

            setLocations((prev) => prev.map((loc) => 
                loc.id === location.id ? { ...loc, status: "generating" } : loc
            ));

            try {
                // Simulate interleaved generation with staggered starts
                await new Promise((resolve) => setTimeout(resolve, index * 500));

                const locationType = locationTypes[index];
                const coords = smartCoordinates[index];
                const locationHint = {
                    nodeId: `demo-loc-${index + 1}`,
                    nodeTitle: locationType.title,
                    nodePromptSeed: locationType.seed,
                    lon: coords.lon * (Math.PI / 180), // Convert to radians
                    lat: coords.lat * (Math.PI / 180), // Convert to radians
                    normalizedX: (coords.lon + 180) / 360,
                    normalizedY: (90 - coords.lat) / 180,
                    coordinateLabel: `Location ${index + 1} on ${context.worldTitle}`,
                    routeSummary: `Following the narrative thread from our hero's journey, we arrive at this significant location on ${context.worldTitle}.`,
                    promptContext: `This location should feel grounded in the world's established lore and the hero's ongoing story. It should reflect the themes and atmosphere of ${context.worldTitle}. vision_lat:${coords.lat} vision_lon:${coords.lon}`,
                };

                const accepted = await launchTrackedJob<{ jobId: string }, Record<string, unknown>>({
                    url: "/api/demo/step-3/jobs",
                    request: {
                        stepOneJobId,
                        heroVariant: context.heroVariant,
                        heroName: context.heroName,
                        worldId: context.worldId,
                        locationHint,
                    },
                    restore: {
                        route: "/demo/3",
                        payload: {
                            stepOneJobId,
                            planetTexture: context.textureUrl,
                            planetTitle: context.worldTitle,
                            hero: context.heroVariant,
                            soundtrack: soundtrackUrl,
                        },
                    },
                    metadata: {
                        demoStep: 3,
                        worldId: context.worldId,
                        locationIndex: index,
                        locationType: locationType.title,
                    },
                    optimisticJob: {
                        kind: "demo.step3.location.v1",
                        title: `Generate ${locationType.title}`,
                        tool: "demo.step3.location",
                        status: "queued",
                        currentStage: "Queued",
                    },
                });

                const detail = await waitForJob(accepted.jobId);
                const artifact = (detail.result as any)?.artifact;

                if (!artifact?.locationTitle || !artifact.briefText) {
                    throw new Error("Location generation failed");
                }

                setLocations((prev) => prev.map((loc) =>
                    loc.id === location.id
                        ? {
                            ...loc,
                            title: artifact.locationTitle,
                            description: artifact.briefText,
                            imageUrl: artifact.image?.url || null,
                            status: "success",
                            error: null,
                        }
                        : loc
                ));
            } catch (err) {
                setLocations((prev) => prev.map((loc) =>
                    loc.id === location.id
                        ? {
                            ...loc,
                            status: "error",
                            error: err instanceof Error ? err.message : "Generation failed",
                        }
                        : loc
                ));
            }
        });

        await Promise.all(locationPromises);
    }, [context, locations, launchTrackedJob, stepOneJobId, soundtrackUrl, waitForJob, analyzeTextureForCoordinates]);

    useEffect(() => {
        if (screenPhase === "ready" && locations.every((loc) => loc.status === "idle") && !generationStartedRef.current) {
            generationStartedRef.current = true;
            void startLocationGeneration();
        }
    }, [screenPhase, locations, startLocationGeneration]);

    // Update markers when locations change - only show when a location is selected
    useEffect(() => {
        const hasSelection = locations.some((loc) => loc.selected);
        
        if (!hasSelection) {
            // Hide all markers when nothing is selected
            setLocationMarkers([]);
            return;
        }
        
        // Show only the selected marker
        const markers = locations
            .filter((loc) => loc.status === "success" && loc.selected)
            .map((loc) => ({
                id: loc.id,
                lat: loc.lat,
                lon: loc.lon,
                label: loc.title,
                selected: true,
            }));
        setLocationMarkers(markers);
    }, [locations, setLocationMarkers]);

    const handleLocationSelect = (locationId: string) => {
        setLocations((prev) => prev.map((loc) => ({
            ...loc,
            selected: loc.id === locationId,
        })));
    };

    const handleExploreLocation = () => {
        if (!selectedLocation || !context) return;

        // Build the navigation params for step 4
        const params = new URLSearchParams();
        if (stepOneJobId) {
            params.set("stepOneJobId", stepOneJobId);
        }
        params.set("hero", context.heroVariant);
        params.set("locationId", selectedLocation.id);
        params.set("locationTitle", selectedLocation.title);
        if (context.textureUrl) {
            params.set("planetTexture", context.textureUrl);
        }
        if (context.worldTitle) {
            params.set("planetTitle", context.worldTitle);
        }
        if (soundtrackUrl) {
            params.set("soundtrack", soundtrackUrl);
        }

        // Navigate to step 4
        navigate(`/demo/4?${params.toString()}`);
    };

    const selectedLocation = locations.find((loc) => loc.selected);

    // Update planet view based on screen phase and selection state
    useEffect(() => {
        const textureUrl = context?.textureUrl || planetTextureParam || null;
        let planetView: "hidden" | "stepThreeIntro" | "stepThreeSelect" = "hidden";
        
        if (textureUrl) {
            if (screenPhase === "intro") {
                planetView = "stepThreeIntro";
            } else if (screenPhase === "ready") {
                // Use stepThreeSelect when a location is selected to show markers
                planetView = selectedLocation ? "stepThreeSelect" : "stepThreeIntro";
            }
        }
        
        setPlanetView(planetView);
    }, [context?.textureUrl, planetTextureParam, screenPhase, selectedLocation, setPlanetView]);

    if (screenPhase === "loading") {
        return (
            <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
                <div className="w-full max-w-[720px] rounded-[28px] border border-white/10 bg-[linear-gradient(160deg,rgba(9,13,21,0.92),rgba(4,7,13,0.88))] px-8 py-10 shadow-[0_32px_100px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
                    <div className="flex items-center gap-4 text-[#d7eaf4]">
                        <LoaderCircle className="h-5 w-5 animate-spin text-[#B3EBF2]" />
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-[#B3EBF2]/60">Surface Arrival</div>
                            <div className="mt-1 text-sm text-slate-200">Loading the persisted world and hero context.</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (screenPhase === "error") {
        return (
            <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
                <div className="w-full max-w-[720px] rounded-[28px] border border-red-400/15 bg-[linear-gradient(160deg,rgba(18,10,12,0.94),rgba(7,4,6,0.92))] px-8 py-10 shadow-[0_32px_100px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
                    <div className="text-[10px] font-black uppercase tracking-[0.28em] text-red-200/60">Step 3 Unavailable</div>
                    <div className="mt-4 text-sm leading-6 text-red-50">{error || "Failed to initialize demo step 3."}</div>
                    <button
                        type="button"
                        onClick={() => setAttemptKey((current) => current + 1)}
                        className="mt-6 inline-flex items-center rounded-full border border-red-200/20 bg-red-200/10 px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.24em] text-red-50 transition-all hover:border-red-200/35 hover:bg-red-200/16"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (screenPhase === "intro") {
        return (
            <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
                <div className="w-full max-w-[820px] rounded-[32px] border border-white/10 bg-[linear-gradient(160deg,rgba(9,13,21,0.92),rgba(4,7,13,0.88))] px-8 py-8 shadow-[0_36px_120px_rgba(0,0,0,0.46)] backdrop-blur-3xl">
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B3EBF2]/60">Surface Arrival</div>
                    <div className="mt-3 text-[30px] font-black uppercase leading-[0.98] tracking-[0.03em] text-white">
                        Follow the same route all the way down.
                    </div>
                    <div className="mt-5 rounded-[22px] border border-white/8 bg-black/20 px-5 py-5">
                        <p className="whitespace-pre-wrap text-[14px] leading-7 text-slate-200">
                            {introBody.slice(0, typedIntroLength)}
                            {typedIntroLength < introBody.length && (
                                <span className="ml-1 inline-block h-[1.05em] w-[2px] animate-pulse bg-[#B3EBF2]/80 align-[-0.18em]" />
                            )}
                        </p>
                    </div>
                    <div className="mt-6 flex items-center justify-between gap-4">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                            {context?.worldTitle || planetTitleParam || "Planetfall"} • {context?.heroName || "Traveler"}
                        </div>
                        <button
                            type="button"
                            onClick={() => setScreenPhase("ready")}
                            className="inline-flex items-center rounded-full border border-amber-400/20 bg-amber-400/10 px-6 py-2.5 text-[10px] font-black uppercase tracking-[0.24em] text-amber-100 transition-all hover:border-amber-300/35 hover:bg-amber-400/16 hover:shadow-[0_0_24px_rgba(251,191,36,0.12)]"
                        >
                            Continue
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative z-10 h-full w-full">
            {/* Floating location panel */}
            <div className="absolute right-6 top-6 bottom-6 w-[480px] flex flex-col gap-3 overflow-y-auto custom-scrollbar animate-in slide-in-from-right-6 duration-500">
                <div className="rounded-[20px] border border-white/10 bg-[linear-gradient(160deg,rgba(9,13,21,0.96),rgba(4,7,13,0.94))] px-5 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
                    <div className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-400/80">Choose Your Location</div>
                    <div className="mt-1 text-xs text-slate-400">
                        {locations.every((loc) => loc.status === "success") 
                            ? "Select a location to explore" 
                            : "Generating locations..."}
                    </div>
                </div>

                {locations.map((location, index) => (
                    <div
                        key={location.id}
                        className={`rounded-[20px] border overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-3xl transition-all duration-300 ${
                            location.selected
                                ? "border-emerald-400/60 bg-[linear-gradient(160deg,rgba(16,185,129,0.15),rgba(5,150,105,0.12))]"
                                : "border-white/10 bg-[linear-gradient(160deg,rgba(9,13,21,0.96),rgba(4,7,13,0.94))]"
                        }`}
                        style={{ animationDelay: `${index * 150}ms` }}
                    >
                        {location.status === "idle" || location.status === "generating" ? (
                            <div className="p-4 flex items-center gap-3">
                                <LoaderCircle className="h-4 w-4 animate-spin text-emerald-400 shrink-0" />
                                <div>
                                    <div className="text-sm font-bold text-slate-200">Location {index + 1}</div>
                                    <div className="text-xs text-slate-500">Generating...</div>
                                </div>
                            </div>
                        ) : location.status === "error" ? (
                            <div className="p-4">
                                <div className="text-sm font-bold text-red-400">Generation Failed</div>
                                <div className="text-xs text-red-300 mt-1">{location.error}</div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    handleLocationSelect(location.id);
                                    setLocations((prev) => prev.map((loc) => ({
                                        ...loc,
                                        expanded: loc.id === location.id ? !loc.expanded : false,
                                    })));
                                }}
                                className="w-full text-left group"
                            >
                                <div className="flex gap-3 p-3">
                                    {location.imageUrl && (
                                        <div className={`relative h-[80px] w-[80px] shrink-0 overflow-hidden rounded-lg transition-all duration-300 ${
                                            location.selected 
                                                ? "ring-2 ring-emerald-400/60 shadow-[0_0_20px_rgba(16,185,129,0.3)]" 
                                                : "ring-1 ring-white/10"
                                        }`}>
                                            <img
                                                src={location.imageUrl}
                                                alt={location.title}
                                                className="h-full w-full object-cover"
                                            />
                                            {location.selected && (
                                                <div className="absolute inset-0 bg-emerald-400/20 flex items-center justify-center">
                                                    <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-sm font-black uppercase tracking-wide truncate transition-colors ${
                                            location.selected ? "text-emerald-300" : "text-white group-hover:text-emerald-200"
                                        }`}>
                                            {location.title}
                                        </div>
                                        <p className={`mt-1 text-xs leading-5 text-slate-300 transition-all ${location.expanded ? "" : "line-clamp-2"}`}>
                                            {location.description}
                                        </p>
                                        <div className={`mt-2 text-[10px] uppercase tracking-wider transition-colors ${
                                            location.selected ? "text-emerald-400" : "text-slate-500 group-hover:text-emerald-400/70"
                                        }`}>
                                            {location.selected ? "✓ Selected" : location.expanded ? "Click to collapse" : "Click to expand"}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        )}
                    </div>
                ))}

                {selectedLocation && (
                    <button
                        type="button"
                        onClick={handleExploreLocation}
                        className="mt-2 w-full rounded-[20px] border border-emerald-400/40 bg-emerald-500/20 px-6 py-4 text-center transition-all hover:bg-emerald-500/30 hover:border-emerald-400/60 hover:shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                    >
                        <div className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300">
                            Explore {selectedLocation.title}
                        </div>
                        <div className="mt-1 text-[10px] text-emerald-200/70">
                            Begin your journey
                        </div>
                    </button>
                )}
            </div>
        </div>
    );
}
