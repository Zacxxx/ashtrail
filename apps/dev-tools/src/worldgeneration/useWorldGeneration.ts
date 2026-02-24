import { useState, useCallback, useRef, useEffect } from "react";
import type { SimulationConfig } from "../modules/geo/types";
import type { GenerationProgress, PlanetWorld, ContinentConfig } from "./types";
import type { GenerationHistoryItem } from "../hooks/useGenerationHistory";
import { BIOME_META } from "../modules/geo/biomes";

interface UseWorldGenerationParams {
    prompt: string;
    config: SimulationConfig;
    aiResolution: string;
    aiTemperature: number;
    continents: ContinentConfig[];
    ecoPrompt: string;
    ecoVegetation: number;
    ecoFauna: number;
    humPrompt: string;
    humSettlements: number;
    humTech: number;
    globeWorld: PlanetWorld | null;
    saveToHistory: (item: GenerationHistoryItem) => Promise<void>;
    setGlobeWorld: (world: PlanetWorld | null) => void;
    setContinents: (continents: ContinentConfig[]) => void;
    setActiveHistoryId: (id: string | null) => void;
    saveCellSubTiles: (cellX: number, cellY: number, subTiles: any[]) => void;
}

export function useWorldGeneration({
    prompt,
    config,
    aiResolution,
    aiTemperature,
    continents,
    ecoPrompt,
    ecoVegetation,
    ecoFauna,
    humPrompt,
    humSettlements,
    humTech,
    globeWorld,
    saveToHistory,
    setGlobeWorld,
    setContinents,
    setActiveHistoryId,
    saveCellSubTiles,
}: UseWorldGenerationParams) {
    const [genProgress, setGenProgress] = useState<GenerationProgress>({
        isActive: false,
        progress: 0,
        stage: "",
        jobId: null,
    });

    const [isGeneratingText, setIsGeneratingText] = useState(false);
    const [regionLore, setRegionLore] = useState<any | null>(null);
    const [isFetchingLore, setIsFetchingLore] = useState(false);

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const fullPromptRef = useRef<string>("");

    // Clean up polling on unmount
    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    // Poll job status
    const pollJobProgress = useCallback((jobId: string, endpointBase: string = "http://127.0.0.1:8787/api/planet/hybrid") => {
        if (pollRef.current) clearInterval(pollRef.current);

        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`${endpointBase}/${jobId}`);
                if (!res.ok) return;
                const data = await res.json();

                setGenProgress({
                    isActive: data.status === "queued" || data.status === "running",
                    progress: data.progress,
                    stage: data.currentStage,
                    jobId,
                });

                if (data.status === "completed" && data.result) {
                    setGenProgress(prev => ({ ...prev, stage: "Decoding final geometry..." }));

                    setTimeout(() => {
                        if (pollRef.current) clearInterval(pollRef.current);
                        pollRef.current = null;

                        const newItem: GenerationHistoryItem = {
                            id: jobId,
                            timestamp: Date.now(),
                            prompt: fullPromptRef.current || prompt,
                            config: config,
                            textureUrl: data.result.textureUrl,
                        };
                        saveToHistory(newItem).catch(console.error);

                        setGlobeWorld({
                            ...data.result,
                            textureUrl: data.result.textureUrl
                        });
                        setActiveHistoryId(jobId);

                        setGenProgress({
                            isActive: false,
                            progress: 100,
                            stage: "Completed",
                            jobId: null,
                        });
                    }, 100);
                } else if (data.status === "failed" || data.status === "cancelled") {
                    if (pollRef.current) clearInterval(pollRef.current);
                    pollRef.current = null;
                    setGenProgress({
                        isActive: false,
                        progress: 0,
                        stage: data.error || "Generation failed",
                        jobId: null,
                    });
                }
            } catch {
                // retry on next tick
            }
        }, 500);
    }, [prompt, config, saveToHistory, setGlobeWorld]);

    const generatePlanet = useCallback(async (generateCells: boolean) => {
        setGenProgress({ isActive: true, progress: 0, stage: "Starting Generation…", jobId: null });
        setGlobeWorld(null);

        const systemPrompt = `Generate a seamless equirectangular projection ALIEN planetary map texture.
STYLE: Deep space satellite photography, photorealistic, top-down orthographic view as seen from orbit.
FORMAT: Must be a valid equirectangular (cylindrical) projection that wraps seamlessly around a sphere — poles at top/bottom, equator centered.
CRITICAL REQUIREMENT: The planet MUST NOT RESEMBLE EARTH. Do not generate Earth-like continents (e.g. Africa, South America, Eurasia). Create completely novel, unrecognizable alien landmass configurations.
ABSOLUTELY FORBIDDEN: No Earth-like geography. No text, labels, annotations, legends, icons, UI elements, borders, or any overlay graphics. No fantasy elements like floating islands, crystals, spires, glowing objects, or impossible geology. This must look like a real photograph of an ALIEN planet taken from space.
RENDER ONLY: Realistic but completely random alien terrain — alien oceans, unusual continents, deserts, forests, ice caps, mountain ranges, rivers, coastlines — as they would appear in actual satellite imagery of an undiscovered exoplanet.`;

        const configPrompt = `Planet parameters to match visually:
- Ocean/water coverage: ~${(config.world.oceanCoverage * 100).toFixed(0)}% of surface
- Mean temperature: ${config.climate.globalMeanTemp}°C (affects ice cap size, desert extent, vegetation coverage)
- Precipitation: ${config.climate.precipitationMultiplier}x Earth baseline
- Tectonic activity: ${config.geo.tectonicIntensity.toFixed(1)} (higher = more mountain ranges, rifts, volcanic islands)
- Volcanic density: ${(config.geo.volcanicDensity * 100).toFixed(0)}% (visible as dark volcanic fields, island chains)`;

        const continentsPrompt = continents.length > 0
            ? `\nLandmass layout guide (geographic distribution only — render as realistic terrain, NOT as literal fantasy descriptions):
${continents.map((c, i) => `- Continent ${i + 1}: roughly ${c.size}% of total land area`).join('\n')}
Distribute the ${continents.length} landmasses across the map with realistic continental shapes, coastlines, and terrain variety.`
            : "";

        const fullPrompt = `${systemPrompt}

${prompt ? `Theme/setting: ${prompt}\n(Interpret thematically — the map must still look like realistic satellite photography)\n` : ""}[PLANET PARAMETERS]:
${configPrompt}${continentsPrompt}`;

        fullPromptRef.current = fullPrompt;

        try {
            const resParts = aiResolution.split("x");
            const cols = parseInt(resParts[0], 10);
            const rows = parseInt(resParts[1], 10);

            const response = await fetch("http://127.0.0.1:8787/api/planet/hybrid", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    config,
                    prompt: fullPrompt,
                    temperature: aiTemperature,
                    cols,
                    rows,
                    generateCells
                }),
            });

            if (!response.ok) {
                const message = await response.text();
                throw new Error(message || `Hybrid generation failed (${response.status})`);
            }

            const { jobId } = await response.json();
            setGenProgress(prev => ({ ...prev, jobId }));
            pollJobProgress(jobId);
        } catch (error) {
            console.error(error);
            setGenProgress({
                isActive: false,
                progress: 0,
                stage: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                jobId: null,
            });
        }
    }, [prompt, config, pollJobProgress, aiResolution, aiTemperature, continents, setGlobeWorld]);

    const handleAutoGenerateContinents = useCallback(async () => {
        setIsGeneratingText(true);
        try {
            const response = await fetch("/api/text/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: "Generate 3 unique geographic descriptions for major continents on a fantasy or alien planet. Format the response ONLY as a strict JSON array of objects, with each object containing a 'name' string and a detailed 'prompt' string describing the landscape. Do not include markdown formatting or backticks around the JSON."
                }),
            });
            if (!response.ok) throw new Error("Failed to generate text");

            const data = await response.json();
            const parsed = JSON.parse(data.text);
            if (Array.isArray(parsed)) {
                setContinents(parsed.map((c: any) => ({
                    id: crypto.randomUUID(),
                    name: c.name || "Unknown Landmass",
                    prompt: c.prompt || "",
                    size: Math.floor(Math.random() * 40) + 40
                })));
            }
        } catch (err) {
            console.error("AI Continent Generation Failed:", err);
        } finally {
            setIsGeneratingText(false);
        }
    }, [setContinents]);

    const generateEcology = useCallback(async (targetRegionName?: string) => {
        if (!globeWorld?.textureUrl) {
            alert("You must generate a Geology map first!");
            return;
        }

        setGenProgress({ isActive: true, progress: 0, stage: "Preparing Base Map...", jobId: null });

        try {
            const imgRes = await fetch(globeWorld.textureUrl);
            const blob = await imgRes.blob();
            const base64_image = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });

            const regionalContext = targetRegionName ? `\n\n🎯 FOCUS AREA: Apply these instructions STRICTLY and ONLY to the geographic region named '${targetRegionName}' (The rest of the planet should remain as the base map).` : "";
            const fullPrompt = `You are an Ecology engine. Overpaint the provided base planetary map with lush biomes. Do not alter the underlying tectonic plates or continent shapes, only color the surface map.
User Instructions: ${ecoPrompt}
Parameters: Vegetation Density: ${ecoVegetation}, Fauna Hotspots: ${ecoFauna}${regionalContext}`;

            const response = await fetch("http://127.0.0.1:8787/api/planet/ecology", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: fullPrompt,
                    base64_image,
                    temperature: aiTemperature,
                }),
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            const { jobId } = await response.json();
            setGenProgress(prev => ({ ...prev, jobId }));
            pollJobProgress(jobId);
        } catch (error) {
            console.error(error);
            setGenProgress({
                isActive: false, progress: 0, stage: `Error: ${error instanceof Error ? error.message : "Unknown error"}`, jobId: null,
            });
        }
    }, [globeWorld, ecoPrompt, ecoVegetation, ecoFauna, aiTemperature, pollJobProgress]);

    const generateHumanity = useCallback(async (targetRegionName?: string) => {
        if (!globeWorld?.textureUrl) {
            alert("You must generate a base map first!");
            return;
        }

        setGenProgress({ isActive: true, progress: 0, stage: "Preparing Ecology Map...", jobId: null });

        try {
            const imgRes = await fetch(globeWorld.textureUrl);
            const blob = await imgRes.blob();
            const base64_image = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });

            const regionalContext = targetRegionName ? `\n\n🎯 FOCUS AREA: Apply these instructions STRICTLY and ONLY to the geographic region named '${targetRegionName}' (The rest of the planet should remain as the base map).` : "";
            const fullPrompt = `You are a Humanity civilization simulator. Overpaint the provided planetary map with signs of intelligent life, cities, roads, and borders. Do not alter the underlying tectonic plates or continent shapes.
User Instructions: ${humPrompt}
Parameters: Settlement Density: ${humSettlements}, Tech Level: ${humTech}${regionalContext}`;

            const response = await fetch("http://127.0.0.1:8787/api/planet/humanity", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: fullPrompt,
                    base64_image,
                    temperature: aiTemperature,
                }),
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            const { jobId } = await response.json();
            setGenProgress(prev => ({ ...prev, jobId }));
            pollJobProgress(jobId);
        } catch (error) {
            console.error(error);
            setGenProgress({
                isActive: false, progress: 0, stage: `Error: ${error instanceof Error ? error.message : "Unknown error"}`, jobId: null,
            });
        }
    }, [globeWorld, humPrompt, humSettlements, humTech, aiTemperature, pollJobProgress]);

    const fetchRegionLore = useCallback(async (selectedCell: any) => {
        if (!selectedCell) return;
        setIsFetchingLore(true);
        setRegionLore(null);

        try {
            const response = await fetch("http://127.0.0.1:8787/api/planet/lore/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lon: selectedCell.x,
                    lat: selectedCell.y,
                    biome: BIOME_META[selectedCell.biome]?.name ?? selectedCell.biome,
                    temperature: selectedCell.temperature,
                    elevation: selectedCell.elevationMeters,
                    resources: selectedCell.mineralDeposits,
                    worldContext: prompt
                })
            });

            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();
            setRegionLore(JSON.parse(data.text));
        } catch (err) {
            console.error(err);
            setRegionLore({ error: "Failed to load region simulation data." });
        } finally {
            setIsFetchingLore(false);
        }
    }, [prompt]);

    const generateUpscale = useCallback(async (historyId: string) => {
        setGenProgress({ isActive: true, progress: 0, stage: "Queuing ESRGAN upscaler...", jobId: null });
        try {
            const response = await fetch("http://127.0.0.1:8787/api/planet/upscale", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ historyId }),
            });
            if (!response.ok) throw new Error(await response.text());
            const { jobId } = await response.json();
            setGenProgress(prev => ({ ...prev, jobId }));
            pollJobProgress(jobId, "http://127.0.0.1:8787/api/planet/upscale");
        } catch (error) {
            console.error(error);
            setGenProgress({
                isActive: false, progress: 0, stage: `Error: ${error instanceof Error ? error.message : "Unknown error"}`, jobId: null,
            });
        }
    }, [pollJobProgress]);

    const generatePlanetCells = useCallback(async (historyId: string, regions?: any[]) => {
        setGenProgress({ isActive: true, progress: 0, stage: "Queuing Cell Analyzer...", jobId: null });
        try {
            const response = await fetch("http://127.0.0.1:8787/api/planet/cells/job", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ historyId, regions }),
            });
            if (!response.ok) throw new Error(await response.text());
            const { jobId } = await response.json();
            setGenProgress(prev => ({ ...prev, jobId }));

            // Custom polling loop for cells to prevent overwriting base globeWorld state
            const cellPoll = setInterval(async () => {
                try {
                    const res = await fetch(`http://127.0.0.1:8787/api/planet/cells/job/${jobId}`);
                    if (!res.ok) return;
                    const data = await res.json();

                    setGenProgress({
                        isActive: data.status === "queued" || data.status === "running",
                        progress: data.progress,
                        stage: data.currentStage,
                        jobId,
                    });

                    if (data.status === "completed") {
                        clearInterval(cellPoll);
                        setGenProgress({ isActive: false, progress: 100, stage: "Completed", jobId: null });
                        window.dispatchEvent(new Event("cells-generated"));
                    } else if (data.status === "failed" || data.status === "cancelled") {
                        clearInterval(cellPoll);
                        setGenProgress({
                            isActive: false, progress: 0, stage: data.error || "Analysis failed", jobId: null,
                        });
                    }
                } catch {
                    // Retry on error
                }
            }, 500);

        } catch (error) {
            console.error(error);
            setGenProgress({
                isActive: false, progress: 0, stage: `Error: ${error instanceof Error ? error.message : "Unknown error"}`, jobId: null,
            });
        }
    }, []);

    const generateCellSubTiles = useCallback(async (selectedCell: any) => {
        if (!selectedCell) return;
        setIsGeneratingText(true);

        try {
            const response = await fetch("/api/text/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: `Generate 7 localized hexagonal sub-tiles (1 center, 6 neighbors) for a region with biome: ${selectedCell.biome}, elevation: ${selectedCell.elevationMeters}m. The planet theme is: ${prompt}.
                    Format the response ONLY as a strict JSON array of objects.
                    Each object must have:
                    - 'id' (e.g. 'Center', 'North', 'NorthEast', etc.)
                    - 'biome' (a sub-variant of the main biome)
                    - 'description' (a very brief 1-sentence description of the terrain at this sub-tile).
                    Do not include markdown formatting or backticks around the JSON.`
                }),
            });

            if (!response.ok) throw new Error("Failed to generate sub-tiles");

            const data = await response.json();
            const parsed = JSON.parse(data.text);

            if (Array.isArray(parsed) && globeWorld) {
                const newCellData = [...globeWorld.cellData];
                const cellIndex = newCellData.findIndex(c => c.x === selectedCell.x && c.y === selectedCell.y);
                if (cellIndex !== -1) {
                    newCellData[cellIndex] = { ...newCellData[cellIndex], subTiles: parsed };
                }
                setGlobeWorld({ ...globeWorld, cellData: newCellData });
                saveCellSubTiles(selectedCell.x, selectedCell.y, parsed);
            }
        } catch (err) {
            console.error("AI Sub-Tile Generation Failed:", err);
        } finally {
            setIsGeneratingText(false);
        }
    }, [prompt, globeWorld, setGlobeWorld, saveCellSubTiles]);

    return {
        genProgress,
        isGeneratingText,
        regionLore,
        isFetchingLore,
        setRegionLore,
        generatePlanet,
        generateEcology,
        generateHumanity,
        handleAutoGenerateContinents,
        fetchRegionLore,
        generateUpscale,
        generateCellSubTiles,
        generatePlanetCells,
    };
}
