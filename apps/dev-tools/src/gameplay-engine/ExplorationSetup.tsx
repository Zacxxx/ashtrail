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
    const [isPackMode, setIsPackMode] = useState(false); // Whether selectedPackId is a Manual Pack or a Batch
    const [selectedStructureIds, setSelectedStructureIds] = useState<string[]>([]);
    const [structureSourceMap, setStructureSourceMap] = useState<Record<string, "batch" | "pack">>({});

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
                const [batchRes, packRes] = await Promise.all([
                    fetch("/api/textures/batches"),
                    fetch("/api/packs")
                ]);

                let batches: any[] = [];
                let packs: any[] = [];

                if (batchRes.ok) batches = await batchRes.json();
                if (packRes.ok) packs = await packRes.json();

                // Combine into available options
                const biomeOptions = [
                    ...batches.filter(b => b.gameAsset?.grouping?.type === "biome").map(b => ({ ...b, source: "batch" })),
                    ...packs.filter(p => p.grouping?.type === "biome").map(p => ({ ...p, source: "pack", batchId: p.packId, batchName: p.name }))
                ];

                const structureOptions = [
                    ...batches.filter(b => b.gameAsset?.grouping?.type === "structure").map(b => ({ ...b, source: "batch" })),
                    ...packs.filter(p => p.grouping?.type === "structure").map(p => ({ ...p, source: "pack", batchId: p.packId, batchName: p.name }))
                ];

                setAvailableBiomes(biomeOptions);
                setAvailableStructures(structureOptions);

                // Pre-select first biome if available
                if (biomeOptions.length > 0) {
                    const firstOption = biomeOptions[0];
                    const name = firstOption.source === "pack"
                        ? (firstOption.grouping?.name || firstOption.name)
                        : (firstOption.gameAsset?.grouping?.name || firstOption.batchName);
                    setSelectedBiomeName(name);
                    setSelectedPackId(firstOption.batchId);
                    setIsPackMode(firstOption.source === "pack");
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

            const mapData = buildExplorationMapPrompt(
                mapPrompt,
                rows,
                cols,
                selectedBiome ? { name: selectedBiome.grouping?.name || selectedBiome.gameAsset?.grouping?.name || selectedBiome.batchName } : undefined,
                selectedStructures.map(s => ({
                    name: s.grouping?.name || s.gameAsset?.grouping?.name || s.batchName,
                    description: s.grouping?.description || s.gameAsset?.grouping?.description || ""
                }))
            );
            const res = await fetch('http://127.0.0.1:8787/api/text/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: mapData }),
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

        const selectedBiome = availableBiomes.find(b => b.batchId === selectedPackId);
        const selectedStructures = availableStructures.filter(s => selectedStructureIds.includes(s.batchId));

        // Attach Biome and Structure info to map metadata
        (mapToUse as any).biomePackId = selectedPackId;
        (mapToUse as any).biomeSource = isPackMode ? "pack" : "batch";
        (mapToUse as any).biomeName = selectedBiomeName;
        (mapToUse as any).structurePackIds = selectedStructureIds;
        (mapToUse as any).structureSourceMap = structureSourceMap;
        (mapToUse as any).structureNames = selectedStructures.map((s: any) =>
            s.source === "pack" ? (s.grouping?.name || "Unknown") : (s.gameAsset?.grouping?.name || "Unknown")
        );

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
                                        {Array.from(new Set(availableBiomes.map(b => b.source === "pack" ? b.grouping?.name : b.gameAsset?.grouping?.name))).filter(Boolean).map(name => (
                                            <button
                                                key={name}
                                                onClick={() => {
                                                    setSelectedBiomeName(name);
                                                    const firstPack = availableBiomes.find(b => (b.source === "pack" ? b.grouping?.name : b.gameAsset?.grouping?.name) === name);
                                                    setSelectedPackId(firstPack?.batchId || null);
                                                    setIsPackMode(firstPack?.source === "pack");
                                                }}
                                                className={`px-4 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${selectedBiomeName === name ? "bg-emerald-500 text-black border-emerald-500 shadow-lg shadow-emerald-500/20" : "bg-black/20 border-white/5 text-gray-500 hover:border-white/20"}`}
                                            >
                                                {name}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Level 2: Specific Packs (Batches or Manual Packs) */}
                                    {selectedBiomeName && (
                                        <div className="grid grid-cols-2 gap-3 p-4 bg-black/20 rounded-2xl border border-white/5">
                                            {availableBiomes.filter(b => (b.source === "pack" ? b.grouping?.name : b.gameAsset?.grouping?.name) === selectedBiomeName).map(pack => (
                                                <button
                                                    key={pack.batchId}
                                                    onClick={() => {
                                                        setSelectedPackId(pack.batchId);
                                                        setIsPackMode(pack.source === "pack");
                                                    }}
                                                    className={`p-3 rounded-xl border transition-all text-left flex flex-col gap-1 ${selectedPackId === pack.batchId ? "bg-emerald-500/10 border-emerald-500/40" : "bg-black/20 border-white/5 hover:border-white/10"}`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="text-[10px] font-bold text-white tracking-wide truncate">{pack.batchName || `Batch ${pack.batchId.substring(0, 6)}`}</span>
                                                            {pack.source === "pack" && (
                                                                <span className="shrink-0 px-1 border border-purple-500/30 bg-purple-500/10 text-purple-400 text-[6px] font-black uppercase tracking-tighter rounded">MANUAL PACK</span>
                                                            )}
                                                        </div>
                                                        {selectedPackId === pack.batchId && <span className="text-emerald-500 text-[8px] font-black italic">SELECTED</span>}
                                                    </div>
                                                    <span className="text-[8px] text-gray-600 uppercase">
                                                        {pack.source === "pack" ? `${pack.textures.length} Textures · ${pack.sprites.length} Sprites` : `${pack.textureCount} Textures`} · {new Date(pack.createdAt).toLocaleDateString()}
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
                                            onClick={() => {
                                                const isSelected = selectedStructureIds.includes(struct.batchId);
                                                if (isSelected) {
                                                    setSelectedStructureIds(prev => prev.filter(id => id !== struct.batchId));
                                                    setStructureSourceMap(prev => {
                                                        const next = { ...prev };
                                                        delete next[struct.batchId];
                                                        return next;
                                                    });
                                                } else {
                                                    setSelectedStructureIds(prev => [...prev, struct.batchId]);
                                                    setStructureSourceMap(prev => ({ ...prev, [struct.batchId]: struct.source }));
                                                }
                                            }}
                                            className={`p-4 rounded-2xl border transition-all text-left flex items-start gap-4 ${selectedStructureIds.includes(struct.batchId) ? "bg-amber-500/10 border-amber-500/40 shadow-lg shadow-amber-500/5" : "bg-black/20 border-white/5 hover:border-white/10"}`}
                                        >
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all ${selectedStructureIds.includes(struct.batchId) ? "bg-amber-500 border-amber-400 text-black" : "bg-white/5 border-white/10 text-gray-500"}`}>
                                                {struct.source === "pack" ? "📦" : "🏛️"}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[11px] font-bold text-white tracking-wide uppercase truncate">{struct.source === "pack" ? (struct.grouping?.name || struct.name) : (struct.gameAsset?.grouping?.name || struct.batchName)}</span>
                                                    {selectedStructureIds.includes(struct.batchId) && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                                                </div>
                                                <div className="text-[9px] text-gray-500 line-clamp-2 mt-1 min-h-[2.5em]">
                                                    {struct.source === "pack" ? (struct.grouping?.description || struct.description) : (struct.gameAsset?.grouping?.description || "No architectural description provided.")}
                                                </div>
                                                {struct.source === "pack" && (
                                                    <span className="mt-2 w-fit px-1.5 py-0.5 border border-purple-500/30 bg-purple-500/10 text-purple-400 text-[7px] font-black uppercase tracking-tighter rounded">MANUAL PACK</span>
                                                )}
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
