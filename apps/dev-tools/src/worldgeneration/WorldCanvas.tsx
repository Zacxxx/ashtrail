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

    // ── Briefing Panel State ──
    const [briefingOpen, setBriefingOpen] = useState(false);
    const [briefingGenerating, setBriefingGenerating] = useState(false);
    const [briefingFauna, setBriefingFauna] = useState<Array<{ name: string; description: string; imageUrl: string | null }>>([]);
    const [briefingFlora, setBriefingFlora] = useState<Array<{ name: string; description: string; imageUrl: string | null }>>([]);
    const [briefingLore, setBriefingLore] = useState<string | null>(null);
    const [briefingTtsUrl, setBriefingTtsUrl] = useState<string | null>(null);
    const [briefingLoreTyped, setBriefingLoreTyped] = useState("");
    const briefingAudioRef = useRef<HTMLAudioElement | null>(null);
    const [briefingAudioPlaying, setBriefingAudioPlaying] = useState(false);
    const briefingGeneratedRef = useRef(false);

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

    // ── Briefing Generation Pipeline ──
    const startBriefingGeneration = useCallback(async () => {
        if (!activeHistoryId || !globeWorld || briefingGeneratedRef.current) return;
        briefingGeneratedRef.current = true;
        setBriefingGenerating(true);

        const demoTravelText = parseDemoTravelTextContent(demoTravelPanel.textContent, demoTravelPanel.zoneInfo?.zoneTitle || "Travel Zone");
        const realZoneTitle = demoTravelText.title || demoTravelPanel.zoneInfo?.zoneTitle || "Travel Zone";
        const biomeLabel = demoTravelPanel.zoneInfo?.biomeLabel || "Unknown";
        const terrainContext = demoTravelPanel.zoneInfo?.promptContext || `Zone: ${realZoneTitle}`;

        // Parallel generation: fauna, flora, lore, images
        const faunaTask = (async () => {
            try {
                const r = await fetch(`${API_BASE}/api/planet/ecology-data/${activeHistoryId}/generate/fauna-batch`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        prompt: `Generate exactly 3 dangerous creature species native to a ${biomeLabel} zone called "${realZoneTitle}". Each must have a unique alien name and a vivid field-guide description. Use these categories: herbivore, predator, omnivore, scavenger, avian, aquatic, alien_other. Context: ${terrainContext}`, 
                        count: 3, 
                        biomeIds: [] 
                    }),
                });
                if (!r.ok) throw new Error(await r.text());
                const data = await r.json();
                const entries = Array.isArray(data?.entries) ? data.entries : [];
                return entries.map((e: any) => ({ name: e.name || "Unknown creature", description: e.description || "", imageUrl: null as string | null }));
            } catch { return []; }
        })();

        const floraTask = (async () => {
            try {
                const r = await fetch(`${API_BASE}/api/planet/ecology-data/${activeHistoryId}/generate/flora-batch`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt: `Generate 3 unique alien plants native to a ${biomeLabel} zone called "${realZoneTitle}". Each must have a unique evocative name and a vivid description of appearance and properties. Context: ${terrainContext}`, count: 3, biomeIds: [] }),
                });
                if (!r.ok) throw new Error(await r.text());
                const data = await r.json();
                const entries = Array.isArray(data?.entries) ? data.entries : [];
                return entries.map((e: any) => ({ name: e.name || "Unknown plant", description: e.description || "", imageUrl: null as string | null }));
            } catch { return []; }
        })();

        const loreTask = (async () => {
            try {
                const accepted = await launchTrackedJob<{ jobId: string }, { prompt: string }>({
                    url: "/api/text/generate",
                    request: { prompt: `Write a short, evocative lore passage (3-4 sentences) about a planetary zone called "${realZoneTitle}" (${biomeLabel}). Set the tone for an expedition. Mention ancient ruins, environmental hazards, or mysterious phenomena. End with a hook that teases an upcoming quest. Return ONLY the raw text, no JSON, no markdown. Context: ${terrainContext}` },
                    optimisticJob: { kind: "worldgen.demo-travel.lore", title: "Generate Zone Lore", tool: "worldgen", status: "queued", currentStage: "Queued", worldId: activeHistoryId || undefined, metadata: { step: "DEMO_TRAVEL_LORE" } },
                    restore: { route: DEVTOOLS_ROUTES.worldgen, search: { step: "DEMO_TRAVEL" }, payload: {} },
                });
                const detail = await waitForJob(accepted.jobId);
                if (detail.status !== "completed") return null;
                return String((detail.result as any)?.text || "").trim() || null;
            } catch { return null; }
        })();

        const [faunaResults, floraResults, loreText] = await Promise.all([faunaTask, floraTask, loreTask]);

        // Generate images for fauna + flora in parallel
        const allEntries = [...faunaResults.map((f: any) => ({ ...f, kind: "fauna" })), ...floraResults.map((f: any) => ({ ...f, kind: "flora" }))];
        const imagePrompts = allEntries.map((e: any) => `Detailed illustration of an alien ${e.kind === "fauna" ? "creature" : "plant"} called "${e.name}": ${e.description}. Expedition field guide style, dark atmospheric background, cinematic lighting.`);

        if (imagePrompts.length > 0) {
            try {
                const r = await fetch(`${API_BASE}/api/textures/generate-batch`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompts: imagePrompts,
                        stylePrompt: "alien creature/plant field guide illustration, dark atmosphere, expedition dossier",
                        temperature: 0.6,
                        category: "ecology_illustrations",
                        subCategory: "demo_briefing",
                        batchName: `${activeHistoryId}-briefing-${Date.now()}`,
                    }),
                });
                if (r.ok) {
                    const manifest = await r.json() as { batchId?: string; textures?: Array<{ filename?: string; url?: string; imageUrl?: string }> };
                    const textures = manifest.textures || [];
                    textures.forEach((tex, i) => {
                        const rawUrl = tex.url || tex.imageUrl || (manifest.batchId && tex.filename ? `/api/textures/${manifest.batchId}/${tex.filename}` : null);
                        const imageUrl = rawUrl ? (rawUrl.startsWith("http") ? rawUrl : `${API_BASE}${rawUrl}`) : null;
                        if (imageUrl && i < allEntries.length) {
                            allEntries[i].imageUrl = imageUrl;
                        }
                    });
                }
            } catch { /* image gen failed, proceed without */ }
        }

        const finalFauna = allEntries.filter((e: any) => e.kind === "fauna").map(({ kind, ...rest }: any) => rest);
        const finalFlora = allEntries.filter((e: any) => e.kind === "flora").map(({ kind, ...rest }: any) => rest);

        setBriefingFauna(finalFauna);
        setBriefingFlora(finalFlora);
        setBriefingLore(loreText);

        // Generate TTS from a combined briefing script
        const ttsScript = [
            `Mission briefing for ${realZoneTitle}.`,
            ...(finalFauna.length > 0 ? [`Hostile fauna detected: ${finalFauna.map((f: any) => f.name).join(", ")}.`] : []),
            ...(finalFlora.length > 0 ? [`Notable flora identified: ${finalFlora.map((f: any) => f.name).join(", ")}.`] : []),
            loreText || "",
        ].filter(Boolean).join(" ");

        if (ttsScript.length > 20) {
            try {
                const r = await fetch(`${API_BASE}/api/tts/generate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: ttsScript, voiceName: "Kore" }),
                });
                if (r.ok) {
                    const data = await r.json() as { audioUrl: string };
                    setBriefingTtsUrl(data.audioUrl ? (data.audioUrl.startsWith("http") ? data.audioUrl : `${API_BASE}${data.audioUrl}`) : null);
                }
            } catch { /* TTS failed, proceed without */ }
        }

        setBriefingGenerating(false);
    }, [activeHistoryId, globeWorld, demoTravelPanel.zoneInfo, launchTrackedJob, waitForJob]);

    const handleDemoTravelStartClick = useCallback(() => {
        // ZONE FREEZE: Do NOT reset the panel or regenerate the zone.
        // Only replay the node animation. Penumbra Pass stays.
        setDemoTravelPanelPhase("hidden");
        setDemoTravelPanelVisible(false);
        setDemoTravelStartToken((previous) => previous + 1);
    }, []);

    // NEW: Auto-trigger briefing generation as soon as zone name is ready to ensure pre-generation
    useEffect(() => {
        if (demoTravelPanel.textStatus === "success" && !briefingGeneratedRef.current && activeHistoryId && globeWorld) {
            void startBriefingGeneration();
        }
    }, [demoTravelPanel.textStatus, activeHistoryId, globeWorld, startBriefingGeneration]);

    const handleOpenBriefing = useCallback(() => {
        setBriefingOpen(true);
        setBriefingLoreTyped("");
    }, []);

    const handleCloseBriefing = useCallback(() => {
        setBriefingOpen(false);
        if (briefingAudioRef.current) {
            briefingAudioRef.current.pause();
            briefingAudioRef.current = null;
            setBriefingAudioPlaying(false);
        }
    }, []);

    const handleToggleBriefingAudio = useCallback(() => {
        if (!briefingTtsUrl) return;
        if (briefingAudioRef.current) {
            if (briefingAudioPlaying) {
                briefingAudioRef.current.pause();
                setBriefingAudioPlaying(false);
            } else {
                briefingAudioRef.current.play();
                setBriefingAudioPlaying(true);
            }
            return;
        }
        const audio = new Audio(briefingTtsUrl);
        briefingAudioRef.current = audio;
        audio.onended = () => setBriefingAudioPlaying(false);
        audio.play();
        setBriefingAudioPlaying(true);
    }, [briefingTtsUrl, briefingAudioPlaying]);

    // Typing animation for lore
    useEffect(() => {
        if (!briefingOpen || !briefingLore) return;
        let i = 0;
        setBriefingLoreTyped("");
        const interval = setInterval(() => {
            i++;
            setBriefingLoreTyped(briefingLore.slice(0, i));
            if (i >= briefingLore.length) clearInterval(interval);
        }, 22);
        return () => clearInterval(interval);
    }, [briefingOpen, briefingLore]);

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

    const handleDemoTravelUpdate = useCallback((payload: { screenX: number; screenY: number; isVisibleOnScreen: boolean }) => {
        setDemoTravelPanelAnchor(resolveDemoTravelAnchor(payload as DemoTravelFinalTriggerPayload));
    }, [resolveDemoTravelAnchor]);

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

    const locationMarkers = (humanityLocations || []).map((loc) => ({
        id: loc.id,
        x: loc.x,
        y: loc.y,
        color: categoryColor(loc.category),
        isSelected: loc.id === selectedHumanityLocationId,
    }));

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

        const stageWidth = demoTravelStageRef.current?.clientWidth || 0;
        const stageHeight = demoTravelStageRef.current?.clientHeight || 0;
        const demoTravelText = parseDemoTravelTextContent(demoTravelPanel.textContent, demoTravelPanel.zoneInfo?.zoneTitle || "Travel Zone");
        const demoTravelOverview = demoTravelText.overview || demoTravelText.fallback;
        
        const demoTravelCardWidth = stageWidth > 0 ? Math.min(440, Math.max(380, stageWidth * 0.32)) : 420;
        const demoTravelCardHeight = stageHeight > 0 ? Math.min(300, Math.max(260, stageHeight * 0.42)) : 280;
        const demoTravelCardOrigin = demoTravelPanelAnchor
            ? {
                x: stageWidth > 0 ? Math.max(24, stageWidth - demoTravelCardWidth - 24) : 24,
                y: stageHeight > 0 ? Math.max(24, Math.min(stageHeight - demoTravelCardHeight - 24, demoTravelPanelAnchor.y - demoTravelCardHeight * 0.45)) : 24,
            }
            : null;

        const demoTravelCardEntryPoint = demoTravelCardOrigin
            ? { x: demoTravelCardOrigin.x, y: demoTravelCardOrigin.y + demoTravelCardHeight * 0.45 }
            : null;

        const demoTravelConnectorPath = demoTravelPanelAnchor && demoTravelCardEntryPoint
            ? `M ${demoTravelPanelAnchor.x} ${demoTravelPanelAnchor.y} C ${demoTravelPanelAnchor.x - 40} ${demoTravelPanelAnchor.y}, ${demoTravelCardEntryPoint.x + 40} ${demoTravelCardEntryPoint.y}, ${demoTravelCardEntryPoint.x} ${demoTravelCardEntryPoint.y}`
            : null;

        const demoTravelSeedWidth = 140;
        const demoTravelSeedHeight = 120;
        const demoTravelSeedOrigin = demoTravelPanelAnchor
            ? { x: demoTravelPanelAnchor.x - demoTravelSeedWidth - 20, y: demoTravelPanelAnchor.y - demoTravelSeedHeight * 0.5 }
            : null;

        const demoTravelCardTransform = demoTravelPanelAnchor && demoTravelCardOrigin
            ? `translate(${demoTravelPanelAnchor.x - demoTravelCardOrigin.x - 30}px, ${demoTravelPanelAnchor.y - demoTravelCardOrigin.y - 40}px) scale(0.12)`
            : "scale(0.8)";

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
                    onDemoTravelUpdate={handleDemoTravelUpdate}
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
                                    stroke="#B3EBF2"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    style={{
                                        filter: "drop-shadow(0 0 10px rgba(179,235,242,0.4))",
                                        opacity: demoTravelPanelPhase === "hidden" ? 0 : 0.85,
                                        transition: "opacity 320ms ease-out",
                                    }}
                                />
                                {demoTravelPanelAnchor && (
                                    <circle
                                        cx={demoTravelPanelAnchor.x}
                                        cy={demoTravelPanelAnchor.y}
                                        r="3.5"
                                        fill="#B3EBF2"
                                        style={{ filter: "drop-shadow(0 0 8px rgba(179,235,242,0.6))" }}
                                    />
                                )}
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
                                            onClick={handleOpenBriefing}
                                            disabled={briefingGenerating && briefingFauna.length === 0}
                                            className="group inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/8 px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.24em] text-amber-100 transition-all hover:bg-amber-400/16 hover:border-amber-400/35 hover:shadow-[0_0_20px_rgba(251,191,36,0.15)] disabled:opacity-40 disabled:cursor-wait"
                                        >
                                            {briefingGenerating && briefingFauna.length === 0 ? (
                                                <>
                                                    <span className="inline-block w-3 h-3 border-2 border-amber-300/40 border-t-amber-300 rounded-full animate-spin" />
                                                    <span>PREPARING...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-3.5 h-3.5 transition-transform duration-300 group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                                    <span>OPEN BRIEF</span>
                                                </>
                                            )}
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

                {/* ── BRIEFING OVERLAY ── */}
                {briefingOpen && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ backdropFilter: "blur(12px)" }}>
                        <div className="absolute inset-0 bg-[#04070d]/75" onClick={handleCloseBriefing} />
                        <div
                            className="relative z-10 w-[94%] max-w-[960px] max-h-[92vh] flex flex-col rounded-[32px] border border-[#B3EBF2]/12 bg-[linear-gradient(160deg,rgba(10,16,24,0.96),rgba(5,8,12,0.92))] shadow-[0_32px_100px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
                            style={{ animation: "briefingIn 420ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards" }}
                        >
                            <style>{`
                                @keyframes briefingIn {
                                    from { opacity: 0; transform: scale(0.92) translateY(16px); }
                                    to { opacity: 1; transform: scale(1) translateY(0); }
                                }
                                @keyframes typeCursor { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
                            `}</style>
                            <div className="absolute inset-0 rounded-[32px] bg-[radial-gradient(ellipse_at_top_left,rgba(179,235,242,0.06),transparent_50%)]" />

                            {/* Header */}
                            <div className="relative flex items-center justify-between px-7 pt-6 pb-4 border-b border-white/6">
                                <div className="flex items-center gap-4">
                                    {briefingTtsUrl && (
                                        <button
                                            type="button"
                                            onClick={handleToggleBriefingAudio}
                                            className="flex items-center justify-center w-10 h-10 rounded-full border border-amber-400/20 bg-amber-400/8 text-amber-200 hover:bg-amber-400/16 transition-all shadow-[0_0_16px_rgba(251,191,36,0.1)]"
                                            title={briefingAudioPlaying ? "Pause briefing" : "Play briefing"}
                                        >
                                            {briefingAudioPlaying ? (
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                                            ) : (
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                            )}
                                        </button>
                                    )}
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B3EBF2]/60">Mission Briefing</div>
                                        <div className="text-[18px] font-black uppercase tracking-[0.04em] text-white leading-tight mt-0.5">
                                            {demoTravelText.title || demoTravelPanel.zoneInfo?.zoneTitle || "Zone Briefing"}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCloseBriefing}
                                    className="flex items-center justify-center w-9 h-9 rounded-full border border-white/10 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>

                            <div className="relative flex-1 overflow-y-auto px-7 py-5 space-y-9 custom-scrollbar">
                                {/* ── BESTIAIRE ── */}
                                <section>
                                    <div className="flex gap-6">
                                        <div className="shrink-0 w-[160px] h-[140px] rounded-[18px] border border-red-400/12 bg-[linear-gradient(135deg,rgba(239,68,68,0.08),rgba(20,10,10,0.5))] flex flex-col items-center justify-center">
                                            <svg className="w-8 h-8 text-red-400/50 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-red-300/70">Bestiaire</div>
                                            <div className="text-[8px] uppercase tracking-[0.15em] text-red-400/40 mt-0.5">Hostile Fauna</div>
                                        </div>
                                        <div className="flex-1 space-y-2.5">
                                            {briefingFauna.length > 0 ? briefingFauna.map((creature, i) => (
                                                <div key={i} className="flex gap-3 items-start rounded-xl border border-white/5 bg-white/[0.02] p-2.5 hover:bg-white/[0.04] transition-colors">
                                                    <div className="shrink-0 w-[52px] h-[52px] rounded-lg border border-white/8 bg-black/30 overflow-hidden">
                                                        {creature.imageUrl ? (
                                                            <img src={creature.imageUrl} alt={creature.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-[8px] text-white/20 animate-pulse">GEN</div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-[11px] font-bold text-white leading-tight">{creature.name}</div>
                                                        <div className="text-[10px] text-slate-400 leading-[1.4] mt-0.5 line-clamp-2">{creature.description}</div>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="space-y-2">
                                                    {[0,1,2].map(i => <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </section>

                                {/* ── FLORE ── */}
                                <section>
                                    <div className="flex gap-6">
                                        <div className="shrink-0 w-[160px] h-[140px] rounded-[18px] border border-emerald-400/12 bg-[linear-gradient(135deg,rgba(34,197,94,0.08),rgba(10,20,10,0.5))] flex flex-col items-center justify-center">
                                            <svg className="w-8 h-8 text-emerald-400/50 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/70">Flore</div>
                                            <div className="text-[8px] uppercase tracking-[0.15em] text-emerald-400/40 mt-0.5">Native Flora</div>
                                        </div>
                                        <div className="flex-1 space-y-2.5">
                                            {briefingFlora.length > 0 ? briefingFlora.map((plant, i) => (
                                                <div key={i} className="flex gap-3 items-start rounded-xl border border-white/5 bg-white/[0.02] p-2.5 hover:bg-white/[0.04] transition-colors">
                                                    <div className="shrink-0 w-[52px] h-[52px] rounded-lg border border-white/8 bg-black/30 overflow-hidden">
                                                        {plant.imageUrl ? (
                                                            <img src={plant.imageUrl} alt={plant.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-[8px] text-white/20 animate-pulse">GEN</div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-[11px] font-bold text-white leading-tight">{plant.name}</div>
                                                        <div className="text-[10px] text-slate-400 leading-[1.4] mt-0.5 line-clamp-2">{plant.description}</div>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="space-y-2">
                                                    {[0,1,2].map(i => <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </section>

                                {/* ── LORE ── */}
                                <section>
                                    <div className="flex gap-6">
                                        <div className="shrink-0 w-[160px] h-[160px] rounded-[18px] border border-amber-400/12 bg-black/30 overflow-hidden relative">
                                            {demoTravelPanel.imageUrl ? (
                                                <img src={demoTravelPanel.imageUrl} alt="Zone" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center">
                                                    <svg className="w-8 h-8 text-amber-400/40 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300/70">Lore</div>
                                                </div>
                                            )}
                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                                                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-200/80">Zone Lore</div>
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            {briefingLore ? (
                                                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                                                    <p className="text-[12px] leading-[1.7] text-slate-200 font-light">
                                                        {briefingLoreTyped}
                                                        {briefingLoreTyped.length < (briefingLore?.length || 0) && (
                                                            <span className="inline-block w-[2px] h-[14px] bg-amber-300/80 ml-0.5 align-middle" style={{ animation: "typeCursor 600ms steps(1) infinite" }} />
                                                        )}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="space-y-3 pt-2">
                                                    <div className="h-4 w-5/6 rounded-full bg-white/6 animate-pulse" />
                                                    <div className="h-4 w-full rounded-full bg-white/6 animate-pulse" />
                                                    <div className="h-4 w-3/4 rounded-full bg-white/6 animate-pulse" />
                                                    <div className="h-4 w-4/5 rounded-full bg-white/6 animate-pulse" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* Footer */}
                            <div className="relative px-7 py-4 border-t border-white/6 flex items-center justify-between">
                                <div className="text-[9px] uppercase tracking-[0.2em] text-white/25">
                                    {briefingGenerating ? "Generating intel..." : `${briefingFauna.length} fauna • ${briefingFlora.length} flora`}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCloseBriefing}
                                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 hover:bg-white/10 hover:text-white transition-all"
                                >
                                    Close Briefing
                                </button>
                            </div>
                        </div>
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
