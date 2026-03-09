import React, { useState, useEffect } from "react";
import { GameRegistry, Character, ExplorationMap, ExplorationPawn } from "@ashtrail/core";
import { generateExplorationGrid, buildExplorationMapPrompt, parseAIExplorationResponse } from "./explorationGrid";

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
    const [textureBatches, setTextureBatches] = useState<any[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState("");

    const allCharacters = GameRegistry.getAllCharacters();

    useEffect(() => {
        // Initialize with first character if available
        if (allCharacters.length > 0 && selectedCharIds.length === 0) {
            setSelectedCharIds([allCharacters[0].id]);
        }

        // Fetch texture batches
        fetch("/api/textures/batches")
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setTextureBatches(data);
            })
            .catch(err => console.error("Failed to fetch batches:", err));
    }, [allCharacters]);

    const handleGenerateMap = async () => {
        if (!mapPrompt.trim()) {
            const randomMap = generateExplorationGrid(rows, cols);
            setGeneratedMap(randomMap);
            setMapName("Procedural Map");
            return;
        }

        setIsGenerating(true);
        try {
            const prompt = buildExplorationMapPrompt(mapPrompt, rows, cols);
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

        // Apply textures if batch is selected
        if (selectedBatchId) {
            try {
                const res = await fetch(`/api/textures/batches/${selectedBatchId}`);
                if (res.ok) {
                    const manifest = await res.json();
                    const textures = manifest.textures || [];
                    const floorTextures = textures.filter((t: any) => t.prompt.toLowerCase().includes("floor") || t.prompt.toLowerCase().includes("ground"));
                    const wallTextures = textures.filter((t: any) => t.prompt.toLowerCase().includes("wall") || t.prompt.toLowerCase().includes("rock"));

                    if (floorTextures.length > 0 || wallTextures.length > 0) {
                        mapToUse.tiles = mapToUse.tiles.map(tile => {
                            if (tile.type === "floor" && floorTextures.length > 0) {
                                return { ...tile, textureUrl: floorTextures[Math.floor(Math.random() * floorTextures.length)].url };
                            }
                            if (tile.type === "wall" && wallTextures.length > 0) {
                                return { ...tile, textureUrl: wallTextures[Math.floor(Math.random() * wallTextures.length)].url };
                            }
                            return tile;
                        });
                    }
                }
            } catch (err) {
                console.error("Applying textures failed:", err);
            }
        }

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
                type: "human",
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
                    <div className="grid grid-cols-2 gap-8">
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

                        <section>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Visual Theme</h3>
                            <div className="flex flex-col gap-2">
                                <label className="text-[9px] text-gray-500 uppercase tracking-tighter">Asset Pack</label>
                                <select value={selectedBatchId} onChange={e => setSelectedBatchId(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500/50 transition-all outline-none">
                                    <option value="">Default (Flat Colors)</option>
                                    {textureBatches.map(b => (
                                        <option key={b.batchId} value={b.batchId}>{b.batchName || b.batchId}</option>
                                    ))}
                                </select>
                            </div>
                        </section>
                    </div>

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
