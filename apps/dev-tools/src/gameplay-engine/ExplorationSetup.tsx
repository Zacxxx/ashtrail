import React, { useState, useEffect } from "react";
import { GameRegistry, Character, ExplorationMap, ExplorationPawn } from "@ashtrail/core";
import { generateExplorationGrid, buildExplorationMapPrompt, parseAIExplorationResponse } from "./explorationGrid";

function getPawnType(character: Character | null | undefined): ExplorationPawn["type"] {
    if (!character) return "human";
    if (character.explorationSprite?.actorType === "animal") return "animal";
    if (character.explorationSprite?.actorType === "construct") return "mechanoid";
    if (character.type === "Animal") return "animal";
    if (character.type === "Construct") return "mechanoid";
    return "human";
}

interface ExplorationSetupProps {
    onStart: (map: ExplorationMap, selectedPawnId: string) => void;
}

export function ExplorationSetup({ onStart }: ExplorationSetupProps) {
    const [rows, setRows] = useState(64);
    const [cols, setCols] = useState(64);
    const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
    const [mapPrompt, setMapPrompt] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [mapName, setMapName] = useState<string | null>(null);
    const [generatedMap, setGeneratedMap] = useState<ExplorationMap | null>(null);

    // ── New State for Biomes & Structures ──
    const [availableBiomes, setAvailableBiomes] = useState<any[]>([]);
    const [availableStructures, setAvailableStructures] = useState<any[]>([]);
    const [selectedBiomeName, setSelectedBiomeName] = useState<string | null>(null);
    const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
    const [selectedStructureIds, setSelectedStructureIds] = useState<string[]>([]);

    const allCharacters = GameRegistry.getAllCharacters();

    useEffect(() => {
        // Initialize with first character if available
        if (allCharacters.length > 0 && selectedCharIds.length === 0) {
            setSelectedCharIds([allCharacters[0].id]);
        }
    }, [allCharacters, selectedCharIds]);

    useEffect(() => {
        async function fetchAssets() {
            try {
                const res = await fetch("/api/textures/batches");
                if (res.ok) {
                    const batches: any[] = await res.json();
                    const biomes = batches.filter(b => b.gameAsset?.grouping?.type === "biome");
                    const structures = batches.filter(b => b.gameAsset?.grouping?.type === "structure");
                    setAvailableBiomes(biomes);
                    setAvailableStructures(structures);

                    // Pre-select first biome if available
                    if (biomes.length > 0) {
                        const firstBiomeName = biomes[0].gameAsset.grouping.name;
                        setSelectedBiomeName(firstBiomeName);
                        setSelectedPackId(biomes[0].batchId);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch biome/structure assets:", err);
            }
        }
        fetchAssets();
    }, []);

    const handleGenerateMap = async () => {
        if (!mapPrompt.trim()) {
            const randomMap = generateExplorationGrid(rows, cols);
            setGeneratedMap(randomMap);
            setMapName("Procedural Map");
            return;
        }

        setIsGenerating(true);
        try {
            const selectedBiome = availableBiomes.find(b => b.batchId === selectedPackId);
            const selectedStructures = availableStructures.filter(s => selectedStructureIds.includes(s.batchId));

            const prompt = buildExplorationMapPrompt(
                mapPrompt,
                rows,
                cols,
                selectedBiome ? { name: selectedBiome.gameAsset.grouping.name } : undefined,
                selectedStructures.map(s => ({
                    name: s.gameAsset.grouping.name,
                    description: s.gameAsset.grouping.description
                }))
            );
            const res = await fetch('http://127.0.0.1:8787/api/text/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
            });
            const data = await res.json();
            const text = data.text || data.result || "";
            const map = parseAIExplorationResponse(text, rows, cols);
            if (map) {
                setGeneratedMap(map);
                setMapName(map.name || "AI Generated Map");
            }
        } catch (err) {
            console.error("AI Generation failed:", err);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleLaunch = async () => {
        let mapToUse = generatedMap || generateExplorationGrid(rows, cols);

        // Attach Biome and Structure info to map metadata if needed for rendering
        const selectedBiome = availableBiomes.find(b => b.batchId === selectedPackId);
        const selectedStructures = availableStructures.filter(s => selectedStructureIds.includes(s.batchId));

        // Note: The core ExplorationMap type might need extensions to store these IDs if we want to fetch textures later
        // But for now we can just store them as arbitrary metadata if needed, or rely on them being part of the 'grid'
        // For rendering, we'll need to know which Pack to use.
        (mapToUse as any).biomePackId = selectedPackId;
        (mapToUse as any).structurePackIds = selectedStructureIds;

        // Add selected pawns to map
        const pawns: ExplorationPawn[] = selectedCharIds.map(id => {
            const char = GameRegistry.getCharacter(id);
            return {
                id: char?.id || id,
                name: char?.name || "Colonist",
                x: Math.floor(mapToUse.width / 2),
                y: Math.floor(mapToUse.height / 2),
                speed: 4.5,
                factionId: "player",
                type: getPawnType(char),
                sprite: char?.explorationSprite,
                facing: "south",
            };
        });

        mapToUse.pawns = pawns;
        onStart(mapToUse, pawns[0]?.id);
    };

    return (
        <div className="w-full h-full flex items-center justify-center p-8 overflow-y-auto">
            <div className="w-full max-w-[800px] bg-[#111318] border border-white/5 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                <div className="px-10 py-8 border-b border-white/5 bg-black/40">
                    <h2 className="text-xl font-black uppercase tracking-[0.4em] text-emerald-500">🛰️ Exploration Setup</h2>
                    <p className="text-gray-500 text-xs mt-2 font-medium">Mission parameters and crew selection.</p>
                </div>

                <div className="p-10 space-y-10">
                    {/* Grid Config */}
                    <section>
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Map Dimensions</h3>
                        <div className="flex items-center gap-4">
                            <div className="flex-1 flex flex-col gap-2">
                                <label className="text-[9px] text-gray-500 uppercase tracking-tighter">Width</label>
                                <input type="number" value={cols} onChange={e => setCols(+e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500/50 transition-all outline-none" />
                            </div>
                            <div className="flex-1 flex flex-col gap-2">
                                <label className="text-[9px] text-gray-500 uppercase tracking-tighter">Height</label>
                                <input type="number" value={rows} onChange={e => setRows(+e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500/50 transition-all outline-none" />
                            </div>
                        </div>
                    </section>

                    {/* Character Selection */}
                    <section>
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-4">Crew Manifest</h3>
                        <div className="grid grid-cols-2 gap-3">
                            {allCharacters.map(char => (
                                <button
                                    key={char.id}
                                    onClick={() => setSelectedCharIds(prev => prev.includes(char.id) ? prev.filter(id => id !== char.id) : [...prev, char.id])}
                                    className={`p-4 rounded-2xl border transition-all flex items-center gap-4 text-left ${selectedCharIds.includes(char.id) ? "bg-blue-500/10 border-blue-500/40" : "bg-black/20 border-white/5 hover:border-white/10"
                                        }`}
                                >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${selectedCharIds.includes(char.id) ? "bg-blue-500" : "bg-white/5 text-gray-400"}`}>
                                        👤
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-white tracking-wide">{char.name}</span>
                                        <span className="text-[9px] text-gray-600 uppercase">LVL {char.level} • {char.traits[0]?.name || "Colonist"}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Biome & Pack Selection */}
                    <section className="space-y-6">
                        <div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-4">Biome Selection</h3>
                            {availableBiomes.length === 0 ? (
                                <div className="p-4 bg-black/20 border border-white/5 rounded-2xl text-[10px] text-gray-600 uppercase tracking-widest text-center">
                                    No Biome Packs Found.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Level 1: Biome Names */}
                                    <div className="flex flex-wrap gap-2">
                                        {Array.from(new Set(availableBiomes.map(b => b.gameAsset.grouping.name))).map(name => (
                                            <button
                                                key={name}
                                                onClick={() => {
                                                    setSelectedBiomeName(name);
                                                    const firstPack = availableBiomes.find(b => b.gameAsset.grouping.name === name);
                                                    setSelectedPackId(firstPack?.batchId || null);
                                                }}
                                                className={`px-4 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${selectedBiomeName === name ? "bg-emerald-500 text-black border-emerald-500 shadow-lg shadow-emerald-500/20" : "bg-black/20 border-white/5 text-gray-500 hover:border-white/20"}`}
                                            >
                                                {name}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Level 2: Specific Packs (Batches) */}
                                    {selectedBiomeName && (
                                        <div className="grid grid-cols-2 gap-3 p-4 bg-black/20 rounded-2xl border border-white/5">
                                            {availableBiomes.filter(b => b.gameAsset.grouping.name === selectedBiomeName).map(pack => (
                                                <button
                                                    key={pack.batchId}
                                                    onClick={() => setSelectedPackId(pack.batchId)}
                                                    className={`p-3 rounded-xl border transition-all text-left flex flex-col gap-1 ${selectedPackId === pack.batchId ? "bg-emerald-500/10 border-emerald-500/40" : "bg-black/20 border-white/5 hover:border-white/10"}`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-bold text-white tracking-wide truncate">{pack.batchName || `Batch ${pack.batchId.substring(0, 6)}`}</span>
                                                        {selectedPackId === pack.batchId && <span className="text-emerald-500 text-[8px] font-black italic">SELECTED</span>}
                                                    </div>
                                                    <span className="text-[8px] text-gray-600 uppercase">
                                                        {pack.textureCount} Textures · {new Date(pack.createdAt).toLocaleDateString()}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-4">Target Structures</h3>
                            {availableStructures.length === 0 ? (
                                <div className="p-4 bg-black/20 border border-white/5 rounded-2xl text-[10px] text-gray-600 uppercase tracking-widest text-center">
                                    No Structures Found.
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    {availableStructures.map(struct => (
                                        <button
                                            key={struct.batchId}
                                            onClick={() => setSelectedStructureIds(prev => prev.includes(struct.batchId) ? prev.filter(id => id !== struct.batchId) : [...prev, struct.batchId])}
                                            className={`p-4 rounded-2xl border transition-all text-left flex items-start gap-4 ${selectedStructureIds.includes(struct.batchId) ? "bg-amber-500/10 border-amber-500/40 shadow-lg shadow-amber-500/5" : "bg-black/20 border-white/5 hover:border-white/10"}`}
                                        >
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all ${selectedStructureIds.includes(struct.batchId) ? "bg-amber-500 border-amber-400 text-black" : "bg-white/5 border-white/10 text-gray-500"}`}>
                                                🏛️
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[11px] font-bold text-white tracking-wide uppercase truncate">{struct.gameAsset.grouping.name}</span>
                                                    {selectedStructureIds.includes(struct.batchId) && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                                                </div>
                                                <span className="text-[9px] text-gray-500 font-medium leading-relaxed line-clamp-2 italic">
                                                    {struct.gameAsset.grouping.description || "No architectural description provided."}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    {/* AI Map Gen */}
                    <section>
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-4">Geographical Data (AI)</h3>
                        <div className="flex gap-2">
                            <input
                                value={mapPrompt}
                                onChange={e => setMapPrompt(e.target.value)}
                                placeholder="Ancient ruins hidden in a dense jungle..."
                                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-5 py-3 text-xs text-white placeholder:text-gray-700 focus:border-indigo-500/50 outline-none transition-all"
                            />
                            <button
                                onClick={handleGenerateMap}
                                disabled={isGenerating}
                                className="px-6 py-3 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-20 text-black font-black uppercase tracking-widest rounded-xl text-[10px] transition-all"
                            >
                                {isGenerating ? "SCANNING..." : "GENERATE MAP"}
                            </button>
                        </div>
                        {mapName && <div className="mt-3 text-[10px] text-indigo-400 font-bold uppercase tracking-widest animate-pulse">✓ {mapName} LOADED</div>}
                    </section>

                    <div className="pt-8 border-t border-white/5 flex justify-end items-center gap-6">
                        <div className="text-[9px] text-gray-600 font-mono tracking-tighter text-right">
                            MAP: {cols}x{rows} / CREW: {selectedCharIds.length} <br />
                            AI_CORE: {mapName ? "ACTIVE" : "IDLE"}
                        </div>
                        <button
                            onClick={handleLaunch}
                            disabled={selectedCharIds.length === 0}
                            className="px-10 py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-20 text-black font-black uppercase tracking-[0.3em] rounded-2xl text-xs transition-all shadow-lg shadow-emerald-500/20"
                        >
                            🚀 Launch Mission
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
