import { useCallback, useEffect, useRef, useState } from "react";
import { PlanetGlobe, type DemoTravelFinalTriggerPayload } from "../components/PlanetGlobe";
import { PlanetMap3D } from "../components/PlanetMap3D";
import { PlanetMap2D, type MapTransform } from "../components/PlanetMap2D";
import type { TerrainCell } from "../modules/geo/types";
import type { PlanetWorld, ViewMode, WorkflowStep, GeographyTool, RegionType, GeoRegion } from "./types";
import { ProvinceMapView } from "./ProvinceMapView";
import type { WorldLocation } from "../history/locationTypes";
import { useTrackedJobLauncher } from "../jobs/useTrackedJobLauncher";
import { useJobs } from "../jobs/useJobs";
import { DEVTOOLS_ROUTES } from "../lib/routes";

const API_BASE = "http://127.0.0.1:8787";

interface DemoTravelZoneInfo {
    zoneTitle: string;
    biomeLabel: string;
    elevationLabel: string;
    climateLabel: string;
    coordinateLabel: string;
    terrainSummary: string;
    promptContext: string;
}

interface DemoTravelPanelState {
    status: "hidden" | "loading" | "partial" | "ready" | "error";
    triggerPayload: DemoTravelFinalTriggerPayload | null;
    zoneInfo: DemoTravelZoneInfo | null;
    textJobId: string | null;
    textStatus: "idle" | "loading" | "success" | "error";
    textContent: string | null;
    textError: string | null;
    imageStatus: "idle" | "loading" | "success" | "error";
    imageUrl: string | null;
    imageError: string | null;
    requestKey: string | null;
}

type DemoTravelPanelPhase = "hidden" | "opening" | "open";

interface DemoTravelPanelAnchor {
    x: number;
    y: number;
}

interface DemoTravelParsedText {
    title: string | null;
    overview: string | null;
    threat: string | null;
    opportunity: string | null;
    travelNote: string | null;
    fallback: string | null;
}

const EMPTY_DEMO_TRAVEL_PANEL: DemoTravelPanelState = {
    status: "hidden",
    triggerPayload: null,
    zoneInfo: null,
    textJobId: null,
    textStatus: "idle",
    textContent: null,
    textError: null,
    imageStatus: "idle",
    imageUrl: null,
    imageError: null,
    requestKey: null,
};

function formatBiomeLabel(cell: TerrainCell | null): string {
    if (!cell?.biome) return "Unknown biome";
    return cell.biome.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatElevationLabel(cell: TerrainCell | null): string {
    if (typeof cell?.elevationMeters !== "number") return "Elevation unknown";
    return `${Math.round(cell.elevationMeters).toLocaleString()} m`;
}

function formatClimateLabel(cell: TerrainCell | null): string {
    if (!cell) return "Climate unknown";
    const fragments: string[] = [];
    if (typeof cell.temperature === "number") {
        fragments.push(`${Math.round(cell.temperature)}C`);
    }
    if (typeof cell.moisture === "number") {
        fragments.push(`moisture ${(cell.moisture * 100).toFixed(0)}%`);
    }
    if (typeof cell.precipitation === "number") {
        fragments.push(`precip ${(cell.precipitation * 100).toFixed(0)}%`);
    }
    return fragments.length > 0 ? fragments.join(" • ") : "Climate unknown";
}

function formatCoordinateLabel(lat: number, lon: number): string {
    const latDegrees = Math.abs((lat * 180) / Math.PI).toFixed(1);
    const lonDegrees = Math.abs((lon * 180) / Math.PI).toFixed(1);
    const latSuffix = lat >= 0 ? "N" : "S";
    const lonSuffix = lon >= 0 ? "E" : "W";
    return `Lat ${latDegrees}${latSuffix} • Lon ${lonDegrees}${lonSuffix}`;
}

function buildTerrainSummary(cell: TerrainCell | null, biomeLabel: string): string {
    if (!cell) {
        return "Frontier sector identified. Surface resolution limited. Terrain profile partially reconstructed from orbital telemetry.";
    }
    const terrainBits: string[] = [biomeLabel];
    if (typeof cell.slope === "number") {
        terrainBits.push(cell.slope > 0.55 ? "steep relief" : cell.slope > 0.25 ? "broken terrain" : "gentle terrain");
    }
    if (typeof cell.riverFlow === "number" && cell.riverFlow > 0.2) {
        terrainBits.push("active waterways");
    }
    if (cell.isLake) {
        terrainBits.push("lake-adjacent");
    }
    if (typeof cell.vegetationDensity === "number") {
        terrainBits.push(cell.vegetationDensity > 0.6 ? "dense cover" : cell.vegetationDensity > 0.25 ? "mixed cover" : "sparse cover");
    }
    return terrainBits.join(" • ");
}

function resolveTravelCell(globeWorld: PlanetWorld, payload: DemoTravelFinalTriggerPayload): TerrainCell | null {
    if (payload.cell) return payload.cell;
    if (!Array.isArray(globeWorld.cellData) || globeWorld.cellData.length !== globeWorld.cols * globeWorld.rows) return null;
    const projectedX = Math.max(0, Math.min(globeWorld.cols - 1, Math.round(payload.normalizedX * globeWorld.cols - 0.5)));
    const projectedY = Math.max(0, Math.min(globeWorld.rows - 1, Math.round(payload.normalizedY * globeWorld.rows - 0.5)));
    return globeWorld.cellData[projectedY * globeWorld.cols + projectedX] ?? null;
}

function buildDemoTravelZoneInfo(globeWorld: PlanetWorld, payload: DemoTravelFinalTriggerPayload): DemoTravelZoneInfo {
    const cell = resolveTravelCell(globeWorld, payload);
    const biomeLabel = formatBiomeLabel(cell);
    const elevationLabel = formatElevationLabel(cell);
    const climateLabel = formatClimateLabel(cell);
    const coordinateLabel = formatCoordinateLabel(payload.lat, payload.lon);
    const terrainSummary = buildTerrainSummary(cell, biomeLabel);
    const zoneTitle = biomeLabel !== "Unknown biome" ? `Travel Zone // ${biomeLabel}` : "Travel Zone // Frontier Sector";

    const promptContext = [
        "Ashtrail demo travel destination dossier.",
        `Zone title: ${zoneTitle}`,
        `Biome: ${biomeLabel}`,
        `Elevation: ${elevationLabel}`,
        `Climate: ${climateLabel}`,
        `Coordinates: ${coordinateLabel}`,
        `Terrain summary: ${terrainSummary}`,
        typeof cell?.temperature === "number" ? `Temperature: ${cell.temperature.toFixed(1)}C` : "",
        typeof cell?.moisture === "number" ? `Moisture: ${cell.moisture.toFixed(2)}` : "",
        typeof cell?.precipitation === "number" ? `Precipitation: ${cell.precipitation.toFixed(2)}` : "",
        typeof cell?.radiationLevel === "number" ? `Radiation: ${cell.radiationLevel.toFixed(2)}` : "",
        typeof cell?.windExposure === "number" ? `Wind exposure: ${cell.windExposure.toFixed(2)}` : "",
        typeof cell?.soilType === "string" ? `Soil: ${cell.soilType}` : "",
    ].filter(Boolean).join("\n");

    return {
        zoneTitle,
        biomeLabel,
        elevationLabel,
        climateLabel,
        coordinateLabel,
        terrainSummary,
        promptContext,
    };
}

function computeDemoTravelPanelStatus(
    textStatus: DemoTravelPanelState["textStatus"],
    imageStatus: DemoTravelPanelState["imageStatus"],
): DemoTravelPanelState["status"] {
    const textSettled = textStatus === "success" || textStatus === "error";
    const imageSettled = imageStatus === "success" || imageStatus === "error";
    if (!textSettled || !imageSettled) return "loading";
    if (textStatus === "success" && imageStatus === "success") return "ready";
    if (textStatus === "success" || imageStatus === "success") return "partial";
    return "error";
}

function parseDemoTravelTextContent(textContent: string | null, fallbackTitle: string): DemoTravelParsedText {
    const defaultResult: DemoTravelParsedText = {
        title: fallbackTitle,
        overview: null,
        threat: null,
        opportunity: null,
        travelNote: null,
        fallback: null,
    };

    if (!textContent) return defaultResult;

    // Check for JSON first
    try {
        const cleanContent = textContent.trim();
        if (cleanContent.startsWith("{") && cleanContent.endsWith("}")) {
            const data = JSON.parse(cleanContent);
            return {
                ...defaultResult,
                title: data.name || data.title || fallbackTitle,
                overview: data.description || data.overview || null,
                travelNote: data.travel_note || null,
            };
        }
    } catch (e) {
        // Fall back to legacy block parsing
    }

    const blocks = textContent
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean);

    const parsed: DemoTravelParsedText = { ...defaultResult };

    for (const block of blocks) {
        if (block.startsWith("Overview:")) {
            parsed.overview = block.replace(/^Overview:\s*/, "").trim();
            continue;
        }
        if (block.startsWith("Threat:")) {
            parsed.threat = block.replace(/^Threat:\s*/, "").trim();
            continue;
        }
        if (block.startsWith("Opportunity:")) {
            parsed.opportunity = block.replace(/^Opportunity:\s*/, "").trim();
            continue;
        }
        if (block.startsWith("Travel note:")) {
            parsed.travelNote = block.replace(/^Travel note:\s*/, "").trim();
            continue;
        }
        if (!parsed.title || parsed.title === fallbackTitle) {
            parsed.title = block;
        } else {
            parsed.fallback = parsed.fallback ? `${parsed.fallback}\n\n${block}` : block;
        }
    }

    if (!parsed.overview && !parsed.threat && !parsed.opportunity && !parsed.travelNote) {
        parsed.fallback = textContent.trim();
    }

    return parsed;
}

interface GeographyHook {
    regions: GeoRegion[];
    selectedRegionId: string | null;
    hoveredRegionId: string | null;
    setSelectedRegionId: (id: string | null) => void;
    setHoveredRegionId: (id: string | null) => void;
    addRegion: (name: string, type: RegionType, polygon: [number, number][]) => GeoRegion;
    findRegionAtPoint: (x: number, y: number) => GeoRegion | null;
}

interface WorldCanvasProps {
    viewMode: ViewMode;
    globeWorld: PlanetWorld | null;
    showHexGrid: boolean;
    onCellHover: (cell: TerrainCell | null) => void;
    onCellClick: (cell: TerrainCell | null) => void;
    activeStep?: WorkflowStep;
    geographyTool?: GeographyTool;
    activeRegionType?: RegionType;
    geography?: GeographyHook;
    geographyTab?: "regions" | "cells" | "pipeline" | "inspector" | "isolator" | "refinement";
    geoHoveredId?: number | null;
    geoSelectedId?: number | null;
    geoBulkSelectedIds?: number[];
    geoBulkMode?: boolean;
    setGeoHoveredId?: (id: number | null) => void;
    setGeoSelectedId?: (id: number | null) => void;
    onGeoBulkToggleId?: (id: number | null) => void;
    inspectorLayer?: any;
    setInspectorLayer?: (layer: any) => void;
    provinceTextureVersion?: number;
    isMaxView?: boolean;
    setIsMaxView?: (v: boolean) => void;
    activeHistoryId?: string | null;
    humanityLocations?: WorldLocation[];
    selectedHumanityLocationId?: string | null;
    onSelectHumanityLocation?: (id: string | null) => void;
    demoTravelEnabled?: boolean;
    demoTravelReplayToken?: string;
}

export function WorldCanvas({
    viewMode,
    globeWorld,
    showHexGrid,
    onCellHover,
    onCellClick,
    activeStep,
    geographyTool = "pan",
    activeRegionType = "continent",
    geography,
    geographyTab = "regions",
    geoHoveredId,
    geoSelectedId,
    geoBulkSelectedIds = [],
    geoBulkMode = false,
    setGeoHoveredId,
    setGeoSelectedId,
    onGeoBulkToggleId,
    inspectorLayer,
    setInspectorLayer,
    provinceTextureVersion = 0,
    isMaxView = false,
    setIsMaxView,
    activeHistoryId,
    humanityLocations = [],
    selectedHumanityLocationId = null,
    onSelectHumanityLocation,
    demoTravelEnabled = false,
    demoTravelReplayToken = "",
}: WorldCanvasProps) {
    const [mapTransform, setMapTransform] = useState<MapTransform>({ x: 0, y: 0, scale: 1 });
    const [demoTravelStartToken, setDemoTravelStartToken] = useState(0);
    const [demoTravelPanel, setDemoTravelPanel] = useState<DemoTravelPanelState>(EMPTY_DEMO_TRAVEL_PANEL);
    const [demoTravelPanelVisible, setDemoTravelPanelVisible] = useState(false);
    const [demoTravelPanelPhase, setDemoTravelPanelPhase] = useState<DemoTravelPanelPhase>("hidden");
    const [demoTravelPanelAnchor, setDemoTravelPanelAnchor] = useState<DemoTravelPanelAnchor | null>(null);
    const [demoTravelDestinationPayload, setDemoTravelDestinationPayload] = useState<DemoTravelFinalTriggerPayload | null>(null);
    const demoTravelRequestKeyRef = useRef<string | null>(null);
    const demoTravelGenerationCacheRef = useRef(new Map<string, DemoTravelPanelState>());
    const demoTravelGenerationTaskRef = useRef(new Map<string, Promise<void>>());
    const demoTravelStageRef = useRef<HTMLDivElement>(null);
    const demoTravelOpenTimeoutRef = useRef<number | null>(null);
    const launchTrackedJob = useTrackedJobLauncher();
    const { waitForJob } = useJobs();

    const resetDemoTravelPanel = useCallback(() => {
        demoTravelRequestKeyRef.current = null;
        if (demoTravelOpenTimeoutRef.current !== null) {
            window.clearTimeout(demoTravelOpenTimeoutRef.current);
            demoTravelOpenTimeoutRef.current = null;
        }
        setDemoTravelPanelVisible(false);
        setDemoTravelPanelPhase("hidden");
        setDemoTravelPanelAnchor(null);
        setDemoTravelDestinationPayload(null);
        setDemoTravelPanel(EMPTY_DEMO_TRAVEL_PANEL);
    }, []);

    useEffect(() => {
        setDemoTravelStartToken(0);
        resetDemoTravelPanel();
    }, [demoTravelEnabled, demoTravelReplayToken, resetDemoTravelPanel]);

    const getDemoTravelCacheKey = useCallback((payload: DemoTravelFinalTriggerPayload) => {
        return `${activeHistoryId || "world"}:${payload.normalizedX.toFixed(4)}:${payload.normalizedY.toFixed(4)}`;
    }, [activeHistoryId]);

    useEffect(() => {
        if (demoTravelPanelPhase !== "opening") return;
        if (demoTravelOpenTimeoutRef.current !== null) {
            window.clearTimeout(demoTravelOpenTimeoutRef.current);
        }
        demoTravelOpenTimeoutRef.current = window.setTimeout(() => {
            setDemoTravelPanelPhase("open");
            demoTravelOpenTimeoutRef.current = null;
        }, 460);
        return () => {
            if (demoTravelOpenTimeoutRef.current !== null) {
                window.clearTimeout(demoTravelOpenTimeoutRef.current);
                demoTravelOpenTimeoutRef.current = null;
            }
        };
    }, [demoTravelPanelPhase]);

    const startDemoTravelInterleavedGeneration = useCallback(async (payload: DemoTravelFinalTriggerPayload, revealPanel: boolean) => {
        if (!globeWorld) return;

        const zoneInfo = buildDemoTravelZoneInfo(globeWorld, payload);
        const requestKey = getDemoTravelCacheKey(payload);
        const cached = demoTravelGenerationCacheRef.current.get(requestKey);
        if (cached) {
            demoTravelRequestKeyRef.current = requestKey;
            setDemoTravelPanel({
                ...cached,
                triggerPayload: payload,
                zoneInfo: cached.zoneInfo || zoneInfo,
                requestKey,
            });
            if (revealPanel) {
                setDemoTravelPanelVisible(true);
            }
            return;
        }

        const inFlight = demoTravelGenerationTaskRef.current.get(requestKey);
        if (inFlight) {
            demoTravelRequestKeyRef.current = requestKey;
            setDemoTravelPanel({
                status: "loading",
                triggerPayload: payload,
                zoneInfo,
                textJobId: null,
                textStatus: "loading",
                textContent: null,
                textError: null,
                imageStatus: "loading",
                imageUrl: null,
                imageError: null,
                requestKey,
            });
            if (revealPanel) {
                setDemoTravelPanelVisible(true);
            }
            await inFlight;
            return;
        }

        if (demoTravelRequestKeyRef.current === requestKey) {
            if (revealPanel) {
                setDemoTravelPanelVisible(true);
            }
            return;
        }
        demoTravelRequestKeyRef.current = requestKey;

        setDemoTravelPanelVisible(revealPanel);
        setDemoTravelPanel({
            status: "loading",
            triggerPayload: payload,
            zoneInfo,
            textJobId: null,
            textStatus: "loading",
            textContent: null,
            textError: null,
            imageStatus: "loading",
            imageUrl: null,
            imageError: null,
            requestKey,
        });

        const setPanelPatch = (patch: Partial<DemoTravelPanelState>) => {
            if (demoTravelRequestKeyRef.current !== requestKey) return;
            setDemoTravelPanel((previous) => {
                if (previous.requestKey !== requestKey) return previous;
                const next: DemoTravelPanelState = { ...previous, ...patch };
                next.status = computeDemoTravelPanelStatus(next.textStatus, next.imageStatus);
                demoTravelGenerationCacheRef.current.set(requestKey, next);
                return next;
            });
        };

        const textPrompt = [
            "Generate a cool, evocative name for this planetary sector (e.g., 'Aetheris Reach', 'Siren Sand'). DO NOT use 'Sector', 'Ashtrail', or coordinates.",
            "Description: Two sentences describing the environment. NO technical telemetry, scanning reports, or 'unclassified' mentions.",
            "Return ONLY raw JSON: { \"name\": \"...\", \"description\": \"...\" }. No markdown, no backticks.",
            "",
            zoneInfo.promptContext,
        ].join("\n");

        const imagePrompt = [
            zoneInfo.promptContext,
            "Create a cinematic environmental concept art illustration for this exact destination.",
            "Same world, same local biome, same terrain conditions.",
            "Travel destination dossier illustration, grounded expedition mood, no character portrait, no UI, no text overlay.",
        ].join("\n");

        const generationTask = (async () => {
            const textTask = (async () => {
            try {
                const accepted = await launchTrackedJob<{ jobId: string }, { prompt: string }>({
                    url: "/api/text/generate",
                    request: { prompt: textPrompt },
                    optimisticJob: {
                        kind: "worldgen.demo-travel.text",
                        title: "Generate Demo Travel Zone Text",
                        tool: "worldgen",
                        status: "queued",
                        currentStage: "Queued",
                        worldId: activeHistoryId || undefined,
                        metadata: {
                            step: "DEMO_TRAVEL",
                            zoneTitle: zoneInfo.zoneTitle,
                            routeId: payload.routeId,
                        },
                    },
                    restore: {
                        route: DEVTOOLS_ROUTES.worldgen,
                        search: { step: "DEMO_TRAVEL" },
                        payload: {
                            worldId: activeHistoryId,
                            zoneTitle: zoneInfo.zoneTitle,
                            routeId: payload.routeId,
                        },
                    },
                });
                setPanelPatch({ textJobId: accepted.jobId });
                const detail = await waitForJob(accepted.jobId);
                if (detail.status !== "completed") {
                    throw new Error(detail.error || "Zone text generation failed.");
                }
                const rawText = String((detail.result as { text?: string } | undefined)?.text || "");
                let jsonText = rawText.trim();
                
                // Robust JSON cleaning
                if (jsonText.includes("```")) {
                    jsonText = jsonText.split("```").find(p => p.toLowerCase().includes("title") || p.includes("{")) || jsonText;
                    jsonText = jsonText.replace(/json/gi, "").replace(/```/g, "").trim();
                }

                try {
                    // Validate JSON
                    JSON.parse(jsonText);
                    setPanelPatch({ textStatus: "success", textContent: jsonText, textError: null });
                } catch {
                    // If parsing fails after cleaning, try to extract something or just show fallback
                    setPanelPatch({ textStatus: "success", textContent: jsonText.replace(/[{}"[\]]/g, "").trim(), textError: null });
                }
            } catch (error) {
                setPanelPatch({
                    textStatus: "error",
                    textContent: null,
                    textError: error instanceof Error ? error.message : "Zone text generation failed.",
                });
            }
            })();

            const imageTask = (async () => {
            try {
                const response = await fetch(`${API_BASE}/api/textures/generate-batch`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompts: [imagePrompt],
                        stylePrompt: "cinematic environmental concept art, expedition dossier, grounded worldbuilding illustration",
                        temperature: 0.55,
                        category: "ecology_illustrations",
                        subCategory: "demo_travel",
                        batchName: `${activeHistoryId || "world"}-demo-travel-${Date.now()}`,
                    }),
                });
                if (!response.ok) {
                    throw new Error((await response.text()) || "Zone image generation failed.");
                }
                const manifest = await response.json() as {
                    batchId?: string;
                    textures?: Array<{ filename?: string; url?: string; imageUrl?: string }>;
                };
                const texture = manifest.textures?.[0];
                const rawUrl = texture?.url || texture?.imageUrl || (manifest.batchId && texture?.filename ? `/api/textures/${manifest.batchId}/${texture.filename}` : null);
                const imageUrl = rawUrl ? (rawUrl.startsWith("http") ? rawUrl : `${API_BASE}${rawUrl}`) : null;
                if (!imageUrl) {
                    throw new Error("Zone image generation returned no preview.");
                }
                setPanelPatch({ imageStatus: "success", imageUrl, imageError: null });
            } catch (error) {
                setPanelPatch({
                    imageStatus: "error",
                    imageUrl: null,
                    imageError: error instanceof Error ? error.message : "Zone image generation failed.",
                });
            }
            })();

            await Promise.allSettled([textTask, imageTask]);
        })();

        demoTravelGenerationTaskRef.current.set(requestKey, generationTask);
        try {
            await generationTask;
        } finally {
            demoTravelGenerationTaskRef.current.delete(requestKey);
        }
    }, [activeHistoryId, getDemoTravelCacheKey, globeWorld, launchTrackedJob, waitForJob]);

    const handleDemoTravelStartClick = useCallback(() => {
        resetDemoTravelPanel();
        if (demoTravelDestinationPayload) {
            void startDemoTravelInterleavedGeneration(demoTravelDestinationPayload, false);
        }
        setDemoTravelStartToken((previous) => previous + 1);
    }, [demoTravelDestinationPayload, resetDemoTravelPanel, startDemoTravelInterleavedGeneration]);

    const handleDemoTravelNextPlaceholder = useCallback(() => {
        if (!demoTravelPanel.triggerPayload) return;
        console.info("Demo travel NEXT placeholder", demoTravelPanel.triggerPayload);
    }, [demoTravelPanel.triggerPayload]);

    const resolveDemoTravelAnchor = useCallback((payload: DemoTravelFinalTriggerPayload): DemoTravelPanelAnchor => {
        const stage = demoTravelStageRef.current;
        const width = stage?.clientWidth || 0;
        const height = stage?.clientHeight || 0;
        const margin = 28;
        const fallbackX = width > 0 ? width - Math.min(220, width * 0.24) : payload.screenX;
        const fallbackY = height > 0 ? height * 0.46 : payload.screenY;
        const rawX = payload.isVisibleOnScreen ? payload.screenX : fallbackX;
        const rawY = payload.isVisibleOnScreen ? payload.screenY : fallbackY;
        return {
            x: width > 0 ? Math.max(margin, Math.min(width - margin, rawX)) : rawX,
            y: height > 0 ? Math.max(margin, Math.min(height - margin, rawY)) : rawY,
        };
    }, []);

    const handleDemoTravelDestinationReady = useCallback((payload: DemoTravelFinalTriggerPayload) => {
        setDemoTravelDestinationPayload(payload);
    }, []);

    const handleDemoTravelFinalTrigger = useCallback(async (payload: DemoTravelFinalTriggerPayload) => {
        setDemoTravelPanelAnchor(resolveDemoTravelAnchor(payload));
        setDemoTravelPanelPhase("opening");
        setDemoTravelPanelVisible(true);
        setDemoTravelDestinationPayload(payload);
        await startDemoTravelInterleavedGeneration(payload, true);
    }, [resolveDemoTravelAnchor, startDemoTravelInterleavedGeneration]);

    const categoryColor = (category: WorldLocation["category"]) => {
        switch (category) {
            case "settlement": return "#f97316";
            case "infrastructure": return "#0ea5e9";
            case "resource": return "#eab308";
            case "military": return "#ef4444";
            case "religious": return "#a855f7";
            case "ruin": return "#94a3b8";
            case "wild": return "#22c55e";
            case "hazard": return "#f43f5e";
            case "landmark": return "#14b8a6";
            default: return "#e5e7eb";
        }
    };

    const locationMarkers = humanityLocations.map((location) => ({
        id: location.id,
        x: location.x,
        y: location.y,
        size: 9 + Math.round(Math.max(0, location.importance) / 10),
        color: categoryColor(location.category),
        label: `${location.name} • ${location.type} • ${location.provinceName}`,
        selected: location.id === selectedHumanityLocationId,
    }));

    const demoTravelText = parseDemoTravelTextContent(demoTravelPanel.textContent, demoTravelPanel.zoneInfo?.zoneTitle || "Travel Zone");
    const demoTravelOverview = demoTravelText.overview || demoTravelText.fallback || demoTravelPanel.zoneInfo?.terrainSummary || "";
    const demoTravelSubtitle = demoTravelPanel.zoneInfo
        ? `${demoTravelPanel.zoneInfo.biomeLabel} • ${demoTravelPanel.zoneInfo.coordinateLabel}`
        : "";
    const stageWidth = demoTravelStageRef.current?.clientWidth || 0;
    const stageHeight = demoTravelStageRef.current?.clientHeight || 0;
    const demoTravelMetaRows = demoTravelPanel.zoneInfo
        ? [
            { label: "Biome", value: demoTravelPanel.zoneInfo.biomeLabel },
            { label: "Elevation", value: demoTravelPanel.zoneInfo.elevationLabel },
            { label: "Climate", value: demoTravelPanel.zoneInfo.climateLabel },
            { label: "Coordinates", value: demoTravelPanel.zoneInfo.coordinateLabel },
        ]
        : [];
    const demoTravelCardWidth = stageWidth > 0 ? Math.min(440, Math.max(380, stageWidth * 0.32)) : 420;
    const demoTravelCardHeight = stageHeight > 0 ? Math.min(300, Math.max(260, stageHeight * 0.42)) : 280;
    const demoTravelCardOrigin = demoTravelPanelAnchor
        ? {
            x: stageWidth > 0 ? Math.max(24, stageWidth - demoTravelCardWidth - 24) : 24,
            y: stageHeight > 0 ? Math.max(24, Math.min(stageHeight - demoTravelCardHeight - 24, stageHeight * 0.5 - demoTravelCardHeight * 0.52)) : 24,
        }
        : null;
    const demoTravelCardEntryPoint = demoTravelCardOrigin
        ? {
            x: demoTravelCardOrigin.x + 18,
            y: Math.max(demoTravelCardOrigin.y + 52, Math.min(demoTravelCardOrigin.y + demoTravelCardHeight - 52, demoTravelPanelAnchor?.y || demoTravelCardOrigin.y + demoTravelCardHeight * 0.5)),
        }
        : null;
    const demoTravelSeedWidth = 124;
    const demoTravelSeedHeight = 92;
    const demoTravelSeedOrigin = demoTravelPanelAnchor
        ? {
            x: stageWidth > 0 ? Math.max(20, Math.min(stageWidth - demoTravelSeedWidth - 20, demoTravelPanelAnchor.x - 54)) : demoTravelPanelAnchor.x - 54,
            y: stageHeight > 0 ? Math.max(20, Math.min(stageHeight - demoTravelSeedHeight - 20, demoTravelPanelAnchor.y - 48)) : demoTravelPanelAnchor.y - 48,
        }
        : null;
    const demoTravelSeedEntryPoint = demoTravelSeedOrigin
        ? {
            x: demoTravelSeedOrigin.x + 14,
            y: Math.max(demoTravelSeedOrigin.y + 22, Math.min(demoTravelSeedOrigin.y + demoTravelSeedHeight - 22, demoTravelPanelAnchor?.y || demoTravelSeedOrigin.y + demoTravelSeedHeight * 0.5)),
        }
        : null;
    const demoTravelConnectorTarget = demoTravelPanelPhase === "open" ? demoTravelCardEntryPoint : demoTravelSeedEntryPoint;
    const demoTravelConnectorPath = demoTravelPanelAnchor && demoTravelConnectorTarget
        ? `M ${demoTravelPanelAnchor.x} ${demoTravelPanelAnchor.y} C ${demoTravelPanelAnchor.x + 24} ${demoTravelPanelAnchor.y - 20}, ${demoTravelConnectorTarget.x - 48} ${demoTravelConnectorTarget.y + 10}, ${demoTravelConnectorTarget.x} ${demoTravelConnectorTarget.y}`
        : null;
    const demoTravelCardTransform = demoTravelSeedOrigin && demoTravelCardOrigin
        ? `translate(${demoTravelSeedOrigin.x - demoTravelCardOrigin.x}px, ${demoTravelSeedOrigin.y - demoTravelCardOrigin.y}px) scale(${demoTravelSeedWidth / demoTravelCardWidth}, ${demoTravelSeedHeight / demoTravelCardHeight})`
        : "translate(0px, 0px) scale(0.22, 0.24)";

    // Helper block to keep JSX clean
    const render2DMap = () => {
        if (!globeWorld) {
            return (
                <div className="w-full h-full rounded-2xl border border-white/5 bg-[#1e1e1e]/40 backdrop-blur-md flex flex-col items-center justify-center text-[10px] tracking-widest text-gray-500">
                    <div className="w-16 h-16 border border-white/10 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                    </div>
                    AWAITING MAP GENERATION
                </div>
            );
        }

        return (
            <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 p-1 bg-[#1e1e1e]/40 backdrop-blur-sm group">
                {/* Maximize Toggle Button */}
                {setIsMaxView && (
                    <button
                        onClick={() => setIsMaxView(!isMaxView)}
                        className="absolute top-4 right-4 z-20 w-10 h-10 bg-[#1e1e1e]/80 hover:bg-[#2a2a2a] backdrop-blur-md border border-white/10 rounded-xl flex items-center justify-center text-gray-400 hover:text-white transition-all shadow-lg opacity-0 group-hover:opacity-100"
                        title={isMaxView ? "Restore View" : "Maximize View"}
                    >
                        {isMaxView ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h6m-6 0v6m0-6l6 6m10-6h-6m6 0v6m0-6l-6 6M4 20h6m-6 0v-6m0 6l6-6m10 6h-6m6 0v-6m0 6l-6-6" /></svg>
                        )}
                    </button>
                )}
                <PlanetMap2D
                    world={globeWorld}
                    onTransformChange={setMapTransform}
                    showHexGrid={showHexGrid}
                    onCellHover={onCellHover}
                    onCellClick={onCellClick}
                    locationMarkers={locationMarkers}
                    onLocationMarkerClick={(id) => onSelectHumanityLocation?.(id)}
                />
            </div>
        );
    };

    const render3DGlobe = () => {
        if (!globeWorld) {
            return (
                <div className="w-full h-full rounded-2xl border border-white/5 bg-[#1e1e1e]/40 backdrop-blur-md flex flex-col items-center justify-center text-[10px] tracking-widest text-gray-500 gap-4">
                    <div className="w-24 h-24 border border-white/5 rounded-full flex items-center justify-center">
                        <div className="w-16 h-16 border border-white/10 rounded-full animate-[spin_10s_linear_infinite]" />
                    </div>
                    INITIALIZE GENERATOR ENGINE
                </div>
            );
        }

        return (
            <div ref={demoTravelStageRef} className="w-full h-full rounded-2xl border border-white/5 overflow-hidden relative bg-black/50 shadow-2xl">
                <PlanetGlobe
                    world={globeWorld}
                    onCellHover={onCellHover}
                    onCellClick={onCellClick}
                    showHexGrid={showHexGrid}
                    demoTravelEnabled={demoTravelEnabled}
                    demoTravelReplayToken={demoTravelReplayToken}
                    demoTravelStartToken={demoTravelStartToken}
                    onDemoTravelDestinationReady={handleDemoTravelDestinationReady}
                    onDemoTravelFinalTrigger={handleDemoTravelFinalTrigger}
                />

                {demoTravelEnabled && (
                    <div className="absolute left-1/2 top-5 z-20 -translate-x-1/2">
                        <button
                            type="button"
                            onClick={handleDemoTravelStartClick}
                            className="group relative overflow-hidden rounded-full border border-amber-400/25 bg-[#05080c]/85 px-5 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-amber-100 shadow-[0_0_25px_rgba(251,191,36,0.12)] transition-all duration-300 hover:border-amber-300/45 hover:bg-[#0a1018] hover:shadow-[0_0_35px_rgba(251,191,36,0.24)]"
                        >
                            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/12 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                            <span className="relative z-10">{demoTravelStartToken > 0 ? "Replay travel" : "Start travel"}</span>
                        </button>
                    </div>
                )}

                {demoTravelEnabled && demoTravelPanelVisible && demoTravelPanel.status !== "hidden" && (
                    <>
                        <div
                            className={`absolute inset-0 z-20 bg-[#04070d]/70 transition-opacity duration-500 ease-out ${
                                demoTravelPanelPhase === "open" ? "opacity-100" : "opacity-0"
                            }`}
                        />

                        {demoTravelConnectorPath && (
                            <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible" aria-hidden="true">
                                <defs>
                                    <linearGradient id="demo-travel-tail" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="rgba(179,235,242,0.88)" />
                                        <stop offset="100%" stopColor="rgba(179,235,242,0.16)" />
                                    </linearGradient>
                                </defs>
                                <path
                                    d={demoTravelConnectorPath}
                                    fill="none"
                                    pathLength={1}
                                    stroke="url(#demo-travel-tail)"
                                    strokeWidth="1.6"
                                    strokeLinecap="round"
                                    style={{
                                        filter: "drop-shadow(0 0 12px rgba(179,235,242,0.3))",
                                        strokeDasharray: 1,
                                        strokeDashoffset: demoTravelPanelPhase === "open" ? 0 : 1,
                                        opacity: demoTravelPanelPhase === "open" ? 0.95 : 0.2,
                                        transition: "stroke-dashoffset 540ms cubic-bezier(0.2, 0.8, 0.2, 1) 60ms, opacity 420ms ease-out",
                                    }}
                                />
                                {demoTravelPanelAnchor && null}
                            </svg>
                        )}

                        {demoTravelPanelPhase !== "open" && demoTravelSeedOrigin && (
                            <div
                                className="pointer-events-none absolute z-30 overflow-hidden rounded-[26px] border border-[#B3EBF2]/18 bg-[linear-gradient(160deg,rgba(10,16,24,0.88),rgba(5,8,12,0.82))] shadow-[0_18px_48px_rgba(0,0,0,0.36)] backdrop-blur-xl transition-all duration-[520ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                                style={{
                                    left: `${demoTravelSeedOrigin.x}px`,
                                    top: `${demoTravelSeedOrigin.y}px`,
                                    width: `${demoTravelSeedWidth}px`,
                                    height: `${demoTravelSeedHeight}px`,
                                    opacity: demoTravelPanelPhase === "opening" ? 0.92 : 0,
                                }}
                            >
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(179,235,242,0.12),transparent_60%)]" />
                                <div className="flex h-full flex-col justify-between p-3.5">
                                    <div>
                                        <div className="h-9 w-20 rounded-full border border-[#B3EBF2]/18 bg-[#B3EBF2]/6" />
                                        <div className="mt-3 h-8 rounded-[16px] border border-white/6 bg-white/[0.03]" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="h-2.5 w-4/5 rounded-full bg-white/8" />
                                        <div className="h-2.5 w-3/5 rounded-full bg-white/8" />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div
                            className="pointer-events-none absolute z-30"
                            style={demoTravelCardOrigin ? {
                                left: `${demoTravelCardOrigin.x}px`,
                                top: `${demoTravelCardOrigin.y}px`,
                                width: `${demoTravelCardWidth}px`,
                                height: `${demoTravelCardHeight}px`,
                            } : undefined}
                        >
                            <article
                                className="pointer-events-auto overflow-hidden rounded-[28px] border border-[#B3EBF2]/18 bg-[linear-gradient(160deg,rgba(10,16,24,0.96),rgba(5,8,12,0.92))] shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-[transform,opacity,border-color,box-shadow] duration-[520ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                                style={{
                                    transformOrigin: `18px ${demoTravelCardEntryPoint ? `${Math.max(22, Math.min(demoTravelCardHeight - 22, demoTravelCardEntryPoint.y - demoTravelCardOrigin!.y))}px` : "50%"}`,
                                    transform: demoTravelPanelPhase === "open" ? "translate(0px, 0px) scale(1)" : demoTravelCardTransform,
                                    opacity: demoTravelPanelPhase === "open" ? 1 : 0.08,
                                    boxShadow: demoTravelPanelPhase === "open"
                                        ? "0 24px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(179,235,242,0.08)"
                                        : "0 12px 24px rgba(0,0,0,0.26)",
                                }}
                            >
                                <div className="flex h-full flex-col p-4">
                                    <div className="flex items-end gap-4 pb-1">
                                        <div className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-[14px] border border-white/6 bg-black/25 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
                                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(179,235,242,0.14),transparent_58%)]" />
                                            {demoTravelPanel.imageStatus === "success" && demoTravelPanel.imageUrl ? (
                                                <div className="relative z-10 flex h-full w-full items-center justify-center p-1.5">
                                                    <img
                                                        src={demoTravelPanel.imageUrl}
                                                        alt={demoTravelPanel.zoneInfo?.zoneTitle || "Demo travel zone"}
                                                        className="max-h-full max-w-full object-contain rounded-md"
                                                    />
                                                </div>
                                            ) : demoTravelPanel.imageStatus === "error" ? (
                                                <div className="relative z-10 flex h-full items-center justify-center px-3 text-center text-xs leading-5 text-red-100">
                                                    {demoTravelPanel.imageError || "Image generation failed."}
                                                </div>
                                            ) : (
                                                <div className="relative z-10 flex h-full animate-pulse items-center justify-center text-[10px] font-black uppercase tracking-[0.18em] text-cyan-50/70">
                                                    Rendering
                                                </div>
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="text-[20px] font-black uppercase leading-[1.1] tracking-[0.03em] text-white [text-wrap:balance]">
                                                {demoTravelText.title || demoTravelPanel.zoneInfo?.zoneTitle || "Travel Zone"}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex-1 space-y-3">
                                        {demoTravelPanel.textStatus === "error" ? (
                                            <div className="rounded-xl border border-red-400/18 bg-red-400/8 px-4 py-3 text-xs leading-5 text-red-100">
                                                {demoTravelPanel.textError || "Text generation failed."}
                                            </div>
                                        ) : demoTravelPanel.textStatus === "success" ? (
                                            <div className="space-y-4">
                                                {demoTravelOverview && (
                                                    <div className="rounded-lg border border-white/6 bg-black/15 px-4 py-3 text-[12px] leading-5 text-slate-200">
                                                        {demoTravelOverview}
                                                    </div>
                                                )}
                                                {demoTravelText.travelNote && (
                                                    <div className="px-4 text-[11px] font-medium leading-4 text-cyan-200/50 uppercase tracking-widest italic border-l border-cyan-400/20">
                                                        {demoTravelText.travelNote}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-3 pt-4">
                                                <div className="h-4 w-3/4 animate-pulse rounded-full bg-white/8" />
                                                <div className="h-4 w-full animate-pulse rounded-full bg-white/8" />
                                                <div className="h-4 w-5/6 animate-pulse rounded-full bg-white/8" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-4 flex items-center justify-end border-t border-white/6 pt-3">
                                        <button
                                            type="button"
                                            onClick={handleDemoTravelNextPlaceholder}
                                            className="group inline-flex items-center gap-2 rounded-full border border-[#B3EBF2]/14 bg-[#B3EBF2]/6 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-50 transition-colors hover:bg-[#B3EBF2]/12"
                                        >
                                            <span className="text-[12px] transition-transform duration-300 group-hover:translate-x-0.5">&#8594;</span>
                                            <span>NEXT</span>
                                        </button>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </>
                )}

                {/* Base Texture Mini-Map */}
                {globeWorld.textureUrl && !demoTravelEnabled && (
                    <div className="absolute bottom-6 left-6 border border-white/10 rounded-xl overflow-hidden shadow-2xl opacity-50 hover:opacity-100 transition-all group max-w-[240px]">
                        <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/80 to-transparent p-2 z-10">
                            <p className="text-[8px] font-extrabold tracking-[0.2em] text-white">BASE TEXTURE</p>
                        </div>
                        <img src={globeWorld.textureUrl} alt="AI Map" className="w-full h-auto object-contain bg-black group-hover:scale-105 transition-transform duration-500" />
                    </div>
                )}
            </div>
        );
    };

    const renderPlane3DMap = () => {
        if (!globeWorld) {
            return (
                <div className="w-full h-full rounded-2xl border border-white/5 bg-[#1e1e1e]/40 backdrop-blur-md flex flex-col items-center justify-center text-[10px] tracking-widest text-gray-500 gap-4">
                    <div className="w-24 h-24 border border-white/5 rounded-full flex items-center justify-center">
                        <div className="w-16 h-16 border border-white/10 rounded-full animate-[spin_10s_linear_infinite]" />
                    </div>
                    INITIALIZE GENERATOR ENGINE
                </div>
            );
        }

        return (
            <div className="w-full h-full rounded-2xl border border-white/5 overflow-hidden relative bg-black/50 shadow-2xl">
                <PlanetMap3D world={globeWorld} onCellHover={onCellHover} onCellClick={onCellClick} showHexGrid={showHexGrid} />
            </div>
        );
    };

    const renderProvinceMap = () => {
        return (
            <ProvinceMapView
                planetId={activeHistoryId || null}
                baseTextureUrl={globeWorld?.textureUrl || null}
                geographyTab={geographyTab}
                hoveredId={geoHoveredId ?? null}
                selectedId={geoSelectedId ?? null}
                bulkSelectedIds={geoBulkSelectedIds}
                bulkSelectActive={geoBulkMode}
                onHover={setGeoHoveredId}
                onClick={setGeoSelectedId}
                onBulkToggle={onGeoBulkToggleId}
                activeLayer={inspectorLayer}
                onLayerChange={setInspectorLayer}
                refreshToken={provinceTextureVersion}
            />
        );
    };

    return (
        <main className="flex-1 flex flex-col relative bg-transparent rounded-3xl m-4 overflow-hidden shadow-2xl border border-white/5 z-0">
            <div className="absolute inset-0 bg-[#1e1e1e]" />

            <div className="flex-1 flex p-2 transition-all overflow-hidden z-10 w-full h-full">
                {viewMode === "2d" ? render2DMap() : viewMode === "map3d" ? renderPlane3DMap() : viewMode === "provinces" ? renderProvinceMap() : render3DGlobe()}
            </div>
        </main>
    );
}
