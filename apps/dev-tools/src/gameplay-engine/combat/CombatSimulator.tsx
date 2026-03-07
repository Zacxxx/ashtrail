import React, { useState } from 'react';
import { GameRegistry, Character, Skill } from '@ashtrail/core';
import type { TacticalEntity, CombatConfig, DamagePreview } from '@ashtrail/core';
import { TacticalArena } from './TacticalArena';
import { useCombatWebSocket } from './useCombatWebSocket';
import { Grid, buildMapPrompt, parseAIGridResponse, generateGrid } from './tacticalGrid';
import { GameRulesManager } from '../rules/useGameRules';

// ── Default skills given to characters without their own ──
function getDefaultPlayerSkills(): Skill[] {
    return GameRegistry.getAllSkills().filter(s => ['slash', 'first-aid', 'fireball', 'shove', 'healing-pulse', 'piercing-shot', 'sprint', 'defend', 'hide', 'distract', 'analyze'].includes(s.id));
}
function getDefaultEnemySkills(): Skill[] {
    return GameRegistry.getAllSkills().filter(s => ['slash', 'quick-shot', 'power-strike', 'war-cry'].includes(s.id));
}


function mapCharToTactical(char: Character, isPlayer: boolean, index: number, defaultPlayerSkills: Skill[], defaultEnemySkills: Skill[]): TacticalEntity {
    const skills = char.skills && char.skills.length > 0
        ? char.skills
        : isPlayer ? defaultPlayerSkills : defaultEnemySkills;

    const rules = GameRulesManager.get();
    const maxHp = rules.core.hpBase + char.stats.endurance * rules.core.hpPerEndurance;
    const maxAp = rules.core.apBase + Math.floor(char.stats.agility / rules.core.apAgilityDivisor);
    const maxMp = rules.core.mpBase;

    return {
        id: `${char.id}_${isPlayer ? 'p' : 'e'}${index}`,
        isPlayer,
        name: char.name,
        strength: char.stats.strength,
        agility: char.stats.agility,
        intelligence: char.stats.intelligence,
        wisdom: char.stats.wisdom,
        endurance: char.stats.endurance,
        charisma: char.stats.charisma,
        evasion: Math.floor(char.stats.agility / 4),
        defense: Math.floor(char.stats.endurance / 2),
        hp: maxHp,
        maxHp,
        ap: maxAp,
        maxAp,
        mp: maxMp,
        maxMp,
        level: char.level,
        critChance: char.stats.intelligence * rules.core.critPerIntelligence,
        resistance: char.stats.wisdom * rules.core.resistPerWisdom,
        socialBonus: char.stats.charisma * rules.core.charismaBonusPerCharisma,
        traits: char.traits,
        skills,
        skillCooldowns: {},
        gridPos: { row: 0, col: 0 },
        equipped: char.equipped,
        baseStats: {
            strength: char.stats.strength,
            agility: char.stats.agility,
            intelligence: char.stats.intelligence,
            wisdom: char.stats.wisdom,
            endurance: char.stats.endurance,
            charisma: char.stats.charisma,
            evasion: Math.floor(char.stats.agility / 4),
            defense: Math.floor(char.stats.endurance / 2),
        }
    };
}

export function CombatSimulator() {
    const chars = GameRegistry.getAllCharacters();

    // ── Phase: 'setup' or 'combat' ──
    const [combatStarted, setCombatStarted] = useState(false);
    const [combatKey, setCombatKey] = useState(0);

    // ── Combat Config ──
    const [gridRows, setGridRows] = useState(12);
    const [gridCols, setGridCols] = useState(12);
    const [playerCount, setPlayerCount] = useState(1);
    const [enemyCount, setEnemyCount] = useState(1);
    const [playerIds, setPlayerIds] = useState<string[]>(() => {
        const allC = GameRegistry.getAllCharacters();
        return [allC.length > 0 ? allC[0].id : ''];
    });
    const [enemyIds, setEnemyIds] = useState<string[]>(() => {
        const allC = GameRegistry.getAllCharacters();
        return [allC.length > 1 ? allC[1].id : allC.length > 0 ? allC[0].id : ''];
    });

    // AI Map
    const [mapPrompt, setMapPrompt] = useState('');
    const [aiGrid, setAiGrid] = useState<Grid | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [mapName, setMapName] = useState<string | null>(null);
    const [mapError, setMapError] = useState<string | null>(null);

    // Visual Assets configuration
    const [textureBatches, setTextureBatches] = useState<any[]>([]);
    const [groundMode, setGroundMode] = useState<'battlemap' | 'tiles'>('battlemap');
    const [linkBatches, setLinkBatches] = useState(true);
    const [groundBatchId, setGroundBatchId] = useState<string>("");
    const [obstacleBatchId, setObstacleBatchId] = useState<string>("");

    const [isApplyingTextures, setIsApplyingTextures] = useState(false);
    const [battlemapUrl, setBattlemapUrl] = useState<string | null>(null);

    const updatePlayerCount = (count: number) => {
        setPlayerCount(count);
        setPlayerIds(prev => {
            const next = [...prev];
            const defaultId = chars.length > 0 ? chars[0].id : '';
            while (next.length < count) next.push(defaultId);
            return next.slice(0, count);
        });
    };
    const updateEnemyCount = (count: number) => {
        setEnemyCount(count);
        setEnemyIds(prev => {
            const next = [...prev];
            const defaultId = chars.length > 1 ? chars[1].id : chars.length > 0 ? chars[0].id : '';
            while (next.length < count) next.push(defaultId);
            return next.slice(0, count);
        });
    };

    const setPlayerId = (index: number, id: string) => {
        setPlayerIds(prev => { const n = [...prev]; n[index] = id; return n; });
    };
    const setEnemyId = (index: number, id: string) => {
        setEnemyIds(prev => { const n = [...prev]; n[index] = id; return n; });
    };

    React.useEffect(() => {
        // Sync registry with backend
        GameRegistry.fetchFromBackend("http://127.0.0.1:8787").catch(err => console.warn(err));

        // Fetch texture batches
        fetch("/api/textures/batches")
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setTextureBatches(data);
            })
            .catch(err => console.error("Failed to fetch texture batches:", err));
    }, []);

    const generateAIMap = async () => {
        if (!mapPrompt.trim() || isGenerating) return;
        setIsGenerating(true);
        setMapError(null);
        setMapName(null);
        try {
            const prompt = buildMapPrompt(mapPrompt.trim(), gridRows, gridCols);
            const res = await fetch('http://127.0.0.1:8787/api/text/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
            });
            if (!res.ok) throw new Error(`API error: ${res.status}`);
            const data = await res.json();
            const text = data.text || data.result || (typeof data === 'string' ? data : JSON.stringify(data));
            const grid = parseAIGridResponse(text, gridRows, gridCols);
            if (grid) {
                setAiGrid(grid);
                try {
                    let cleaned = text.trim();
                    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
                    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
                    const parsed = JSON.parse(cleaned);
                    setMapName(parsed.name || null);
                } catch { }
            } else {
                setMapError('Failed to parse AI grid. Try again.');
            }
        } catch (e: any) {
            setMapError(e.message || 'Unknown error');
        } finally {
            setIsGenerating(false);
        }
    };

    const startCombat = async () => {
        setIsApplyingTextures(true);
        try {
            let baseGrid = aiGrid ? JSON.parse(JSON.stringify(aiGrid)) : generateGrid(gridRows, gridCols, 0.12);
            let resolvedBattlemapUrl: string | null = null;

            const effectiveObstacleBatchId = linkBatches ? groundBatchId : obstacleBatchId;

            // Fetch generic textures
            let groundTextures: any[] = [];
            let obstacleTextures: any[] = [];

            if (groundBatchId) {
                const res = await fetch(`/api/textures/batches/${groundBatchId}`);
                if (res.ok) {
                    const manifest = await res.json();
                    groundTextures = Array.isArray(manifest.textures)
                        ? manifest.textures.map((t: any) => ({ ...t, batchSubCategory: manifest.subCategory }))
                        : [];
                }
            }

            if (effectiveObstacleBatchId && effectiveObstacleBatchId !== groundBatchId) {
                const res = await fetch(`/api/textures/batches/${effectiveObstacleBatchId}`);
                if (res.ok) {
                    const manifest = await res.json();
                    obstacleTextures = Array.isArray(manifest.textures)
                        ? manifest.textures.map((t: any) => ({ ...t, batchSubCategory: manifest.subCategory }))
                        : [];
                }
            } else {
                obstacleTextures = groundTextures;
            }

            // --- Process Ground ---
            let gPool: any[] = [];
            if (groundTextures.length > 0) {
                if (groundMode === 'battlemap') {
                    const battlemapT = groundTextures.filter((t: any) =>
                        t.batchSubCategory === 'battlemap' ||
                        t.prompt.toLowerCase().includes('battlemap') ||
                        t.prompt.toLowerCase().includes('terrain') ||
                        t.prompt.toLowerCase().includes('background')
                    );
                    // Use matched battlemaps, or fall back to ANY texture in the batch
                    const bmPool = battlemapT.length > 0 ? battlemapT : groundTextures;
                    resolvedBattlemapUrl = bmPool[Math.floor(Math.random() * bmPool.length)].url;
                } else {
                    gPool = groundTextures.filter((t: any) =>
                        t.batchSubCategory === 'ground' ||
                        t.prompt.toLowerCase().includes('ground') ||
                        t.prompt.toLowerCase().includes('floor') ||
                        t.prompt.toLowerCase().includes('dirt') ||
                        t.prompt.toLowerCase().includes('grass')
                    );
                    if (gPool.length === 0) gPool = groundTextures; // fallback
                }
            }

            // --- Process Obstacles ---
            let oPool: any[] = [];
            if (obstacleTextures.length > 0) {
                oPool = obstacleTextures.filter((t: any) =>
                    t.batchSubCategory !== 'battlemap' &&
                    t.batchSubCategory !== 'ground' &&
                    !t.prompt.toLowerCase().includes('battlemap') &&
                    (t.prompt.toLowerCase().includes('obstacle') ||
                        t.prompt.toLowerCase().includes('wall') ||
                        t.prompt.toLowerCase().includes('object') ||
                        t.prompt.toLowerCase().includes('rock') ||
                        t.prompt.toLowerCase().includes('tree'))
                );
                if (oPool.length === 0) {
                    // fallback: basically anything that isn't a battlemap or pure ground/terrain
                    oPool = obstacleTextures.filter((t: any) => {
                        if (t.batchSubCategory === 'battlemap' || t.batchSubCategory === 'ground') return false;
                        const pr = t.prompt.toLowerCase();
                        return !pr.includes('battlemap') &&
                            !pr.includes('ground') &&
                            !pr.includes('terrain') &&
                            !pr.includes('background') &&
                            !pr.includes('floor') &&
                            !pr.includes('dirt') &&
                            !pr.includes('grass');
                    });
                }
            }

            // --- Apply to Grid ---
            baseGrid.forEach((row: any[]) => {
                row.forEach(cell => {
                    if (cell.walkable) {
                        if (groundMode === 'battlemap' || gPool.length === 0) {
                            cell.textureUrl = undefined;
                        } else {
                            cell.textureUrl = gPool[Math.floor(Math.random() * gPool.length)].url;
                        }
                    } else if (oPool.length > 0) {
                        cell.textureUrl = oPool[Math.floor(Math.random() * oPool.length)].url;
                    }
                });
            });

            setBattlemapUrl(resolvedBattlemapUrl);
            setAiGrid(baseGrid);
            setCombatKey(k => k + 1);
            setCombatStarted(true);
        } catch (e) {
            console.error("Failed to start combat with textures:", e);
            // Fallback to basic start
            setBattlemapUrl(null);
            setCombatKey(k => k + 1);
            setCombatStarted(true);
        } finally {
            setIsApplyingTextures(false);
        }
    };

    const returnToSetup = () => {
        setCombatStarted(false);
        setAiGrid(null);
        setMapName(null);
        setMapError(null);
    };

    const config: CombatConfig = { gridRows, gridCols };

    // ═══════════════════════════════════════════════════
    // PRE-COMBAT SETUP SCREEN
    // ═══════════════════════════════════════════════════
    if (!combatStarted) {
        return (
            <div className="w-full h-full flex items-center justify-center p-8">
                <div className="w-full max-w-[900px] bg-[#111318] border border-white/5 rounded-2xl shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="px-8 py-5 border-b border-white/5 bg-black/40">
                        <h2 className="text-lg font-black uppercase tracking-[0.3em] text-orange-500">⚔️ Combat Setup</h2>
                        <p className="text-gray-500 text-xs mt-1">Configure the battlefield and combatants before engaging.</p>
                    </div>

                    <div className="p-8 space-y-8">
                        {/* ── Grid Size ── */}
                        <section>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Battlefield Dimensions</h3>
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[9px] text-gray-500 uppercase">Rows</label>
                                    <input type="number" min={6} max={20} value={gridRows}
                                        onChange={e => setGridRows(Math.max(6, Math.min(20, +e.target.value)))}
                                        className="w-20 bg-black/60 border border-white/10 text-white text-sm px-3 py-2 rounded-lg text-center outline-none focus:border-orange-500/50" />
                                </div>
                                <span className="text-gray-600 font-black text-lg mt-4">×</span>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[9px] text-gray-500 uppercase">Columns</label>
                                    <input type="number" min={6} max={20} value={gridCols}
                                        onChange={e => setGridCols(Math.max(6, Math.min(20, +e.target.value)))}
                                        className="w-20 bg-black/60 border border-white/10 text-white text-sm px-3 py-2 rounded-lg text-center outline-none focus:border-orange-500/50" />
                                </div>
                                <div className="ml-4 text-[10px] text-gray-600 bg-black/30 rounded-lg px-3 py-2">
                                    {gridRows * gridCols} cells • ~{Math.round(gridRows * gridCols * 0.12)} obstacles
                                </div>
                            </div>
                        </section>

                        {/* ── Combatants ── */}
                        <div className="grid grid-cols-2 gap-6">
                            {/* Players */}
                            <section>
                                <div className="flex items-center gap-3 mb-3">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-400">Players</h3>
                                    <div className="flex items-center gap-1.5">
                                        <button onClick={() => updatePlayerCount(Math.max(1, playerCount - 1))}
                                            className="w-6 h-6 rounded bg-black/50 border border-white/10 text-gray-400 text-xs hover:bg-white/10">−</button>
                                        <span className="text-white font-bold text-sm w-4 text-center">{playerCount}</span>
                                        <button onClick={() => updatePlayerCount(Math.min(4, playerCount + 1))}
                                            className="w-6 h-6 rounded bg-black/50 border border-white/10 text-gray-400 text-xs hover:bg-white/10">+</button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {Array.from({ length: playerCount }).map((_, i) => (
                                        <div key={`p-${i}`} className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-blue-600 border border-blue-400 flex items-center justify-center text-[9px] font-black text-white shrink-0">
                                                P{i + 1}
                                            </div>
                                            <select value={playerIds[i] || 'mock_1'}
                                                onChange={e => setPlayerId(i, e.target.value)}
                                                className="flex-1 bg-black/50 border border-blue-500/20 text-white text-xs px-3 py-2 rounded-lg outline-none focus:border-blue-500/50">
                                                <option value="mock_1">Default Character {i + 1}</option>
                                                {chars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* Enemies */}
                            <section>
                                <div className="flex items-center gap-3 mb-3">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-red-400">Enemies</h3>
                                    <div className="flex items-center gap-1.5">
                                        <button onClick={() => updateEnemyCount(Math.max(1, enemyCount - 1))}
                                            className="w-6 h-6 rounded bg-black/50 border border-white/10 text-gray-400 text-xs hover:bg-white/10">−</button>
                                        <span className="text-white font-bold text-sm w-4 text-center">{enemyCount}</span>
                                        <button onClick={() => updateEnemyCount(Math.min(4, enemyCount + 1))}
                                            className="w-6 h-6 rounded bg-black/50 border border-white/10 text-gray-400 text-xs hover:bg-white/10">+</button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {Array.from({ length: enemyCount }).map((_, i) => (
                                        <div key={`e-${i}`} className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-red-600 border border-red-400 flex items-center justify-center text-[9px] font-black text-white shrink-0">
                                                E{i + 1}
                                            </div>
                                            <select value={enemyIds[i] || 'mock_2'}
                                                onChange={e => setEnemyId(i, e.target.value)}
                                                className="flex-1 bg-black/50 border border-red-500/20 text-white text-xs px-3 py-2 rounded-lg outline-none focus:border-red-500/50">
                                                <option value="mock_2">Default Enemy {i + 1}</option>
                                                {chars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>

                        {/* ── Visual Assets ── */}
                        <section>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Visual Assets</h3>
                                <label className="flex items-center gap-2 cursor-pointer group" onClick={() => setLinkBatches(!linkBatches)}>
                                    <div className={`w-8 h-4 rounded-full transition-colors flex items-center p-0.5 ${linkBatches ? 'bg-emerald-500' : 'bg-gray-700'}`}>
                                        <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${linkBatches ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest group-hover:text-gray-200 transition-colors select-none">
                                        Bundle Packs
                                    </span>
                                </label>
                            </div>

                            <div className="flex gap-4">
                                {/* Ground Configuration */}
                                <div className="flex-1 bg-black/30 p-4 rounded-xl border border-white/5 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[9px] font-bold text-gray-500 uppercase">Ground Rendering</label>
                                        <div className="flex bg-black/50 rounded-lg p-1 border border-white/5">
                                            <button
                                                onClick={() => setGroundMode('battlemap')}
                                                className={`px-3 py-1 text-[9px] font-bold tracking-widest uppercase rounded ${groundMode === 'battlemap' ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}
                                            >
                                                Battlemap
                                            </button>
                                            <button
                                                onClick={() => setGroundMode('tiles')}
                                                className={`px-3 py-1 text-[9px] font-bold tracking-widest uppercase rounded ${groundMode === 'tiles' ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}
                                            >
                                                Tiles
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-gray-500 uppercase mb-1 block">Ground Pack</label>
                                        <select
                                            value={groundBatchId}
                                            onChange={e => setGroundBatchId(e.target.value)}
                                            className="w-full bg-black/60 border border-emerald-500/20 text-white text-xs px-3 py-2.5 rounded-lg outline-none focus:border-emerald-500/50"
                                        >
                                            <option value="">No Ground Asset (Default)</option>
                                            {textureBatches.map(batch => (
                                                <option key={batch.batchId} value={batch.batchId}>
                                                    {batch.subCategory ? `[${batch.subCategory.toUpperCase()}] ` : ''}{batch.batchName || batch.batchId} ({batch.createdAt.split('T')[0]})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Obstacle Configuration */}
                                <div className={`flex-1 p-4 rounded-xl border border-white/5 space-y-4 transition-all ${linkBatches ? 'bg-black/10 opacity-50 pointer-events-none' : 'bg-black/30'}`}>
                                    <label className="text-[9px] font-bold text-gray-500 uppercase block">Obstacle Rendering</label>
                                    <div>
                                        <label className="text-[9px] text-gray-500 uppercase mb-1 block">Obstacle Pack</label>
                                        <select
                                            value={linkBatches ? groundBatchId : obstacleBatchId}
                                            onChange={e => setObstacleBatchId(e.target.value)}
                                            className="w-full bg-black/60 border border-emerald-500/20 text-white text-xs px-3 py-2.5 rounded-lg outline-none focus:border-emerald-500/50"
                                            disabled={linkBatches}
                                        >
                                            <option value="">{linkBatches ? '(Linked to Ground Pack)' : 'No Obstacle Asset (Default)'}</option>
                                            {!linkBatches && textureBatches.map(batch => (
                                                <option key={batch.batchId} value={batch.batchId}>
                                                    {batch.subCategory ? `[${batch.subCategory.toUpperCase()}] ` : ''}{batch.batchName || batch.batchId} ({batch.createdAt.split('T')[0]})
                                                </option>
                                            ))}
                                        </select>
                                        <div className="mt-3 text-[9px] text-gray-500 leading-relaxed">
                                            {linkBatches
                                                ? "Obstacles will be extraced from the same pack as the Ground."
                                                : "Obstacles will be rendered using 'obstacle', 'tree', or 'wall' prompts from this separate pack."}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* ── AI Map Generation ── */}
                        <section>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-3">AI Map Generation <span className="text-gray-600 font-normal">(optional)</span></h3>
                            <div className="flex gap-2">
                                <input value={mapPrompt} onChange={e => setMapPrompt(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') generateAIMap(); }}
                                    placeholder="Describe a battlefield... (e.g. 'ruined temple with pillars and a central altar')"
                                    className="flex-1 bg-black/50 border border-white/10 text-white text-xs px-3 py-2.5 rounded-lg outline-none focus:border-indigo-500/50 placeholder:text-gray-600"
                                    disabled={isGenerating} />
                                <button onClick={generateAIMap}
                                    disabled={isGenerating || !mapPrompt.trim()}
                                    className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-30 text-white font-black uppercase tracking-widest rounded-lg text-[10px] transition-all shrink-0">
                                    {isGenerating ? '⟳ Generating...' : '✨ Generate'}
                                </button>
                            </div>
                            {mapName && (
                                <div className="mt-2 text-xs text-indigo-400 font-mono bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20 inline-block">
                                    ✓ Map generated: {mapName}
                                </div>
                            )}
                            {mapError && (
                                <div className="mt-2 text-xs text-red-400">⚠ {mapError}</div>
                            )}
                        </section>

                        {/* ── Launch Button ── */}
                        <div className="flex justify-between items-center pt-4 border-t border-white/5">
                            <div className="text-[10px] text-gray-600">
                                {playerCount} player{playerCount > 1 ? 's' : ''} vs {enemyCount} enem{enemyCount > 1 ? 'ies' : 'y'} on a {gridRows}×{gridCols} grid
                                {mapName ? ` • ${mapName}` : ' • Random map'}
                            </div>
                            <button onClick={startCombat}
                                disabled={isApplyingTextures}
                                className="px-8 py-3 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-950 disabled:text-orange-900 text-black font-black uppercase tracking-[0.2em] rounded-xl text-sm transition-all shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40">
                                {isApplyingTextures ? 'Initializing...' : '⚔️ Start Combat'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════
    // ACTIVE COMBAT
    // ═══════════════════════════════════════════════════
    return (
        <div className="w-full h-full flex flex-col gap-0 bg-black/40 border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
            {/* Thin top bar with back button */}
            <div className="shrink-0 flex items-center justify-between px-4 py-1.5 bg-black/60 border-b border-white/5">
                <button onClick={returnToSetup}
                    className="text-[9px] text-gray-500 hover:text-white font-bold uppercase tracking-widest transition-all">
                    ← Back to Setup
                </button>
                <span className="text-[9px] text-gray-600">
                    {playerCount}v{enemyCount} • {gridRows}×{gridCols}{mapName ? ` • ${mapName}` : ''}
                </span>
            </div>

            {/* Arena */}
            <div className="flex-1 overflow-hidden">
                <TacticalCombatArena
                    key={`combat-${combatKey}`}
                    playerIds={playerIds}
                    enemyIds={enemyIds}
                    aiGrid={aiGrid}
                    config={config}
                    battlemapUrl={battlemapUrl}
                />
            </div>
        </div>
    );
}

function TacticalCombatArena({
    playerIds, enemyIds, aiGrid, config, battlemapUrl
}: {
    playerIds: string[];
    enemyIds: string[];
    aiGrid: Grid | null;
    config: CombatConfig;
    battlemapUrl: string | null;
}) {
    // Dynamically grab default skills from the game registry
    const defaultPlayerSkills = getDefaultPlayerSkills();
    const defaultEnemySkills = getDefaultEnemySkills();

    const playerEntities = playerIds
        .map(id => GameRegistry.getCharacter(id))
        .filter((char): char is Character => char !== undefined)
        .map((char, i) => mapCharToTactical(char, true, i, defaultPlayerSkills, defaultEnemySkills));

    const enemyEntities = enemyIds
        .map(id => GameRegistry.getCharacter(id))
        .filter((char): char is Character => char !== undefined)
        .map((char, i) => mapCharToTactical(char, false, i, defaultPlayerSkills, defaultEnemySkills));

    const {
        grid, entities, turnOrder, activeEntityId, activeEntity,
        isPlayerTurn, phase, playerAction, logs, turnNumber,
        handleCellClick, endTurn, selectSkill, selectedSkill, MELEE_ATTACK_COST,
    } = useCombatWebSocket({
        players: playerEntities,
        enemies: enemyEntities,
        grid: aiGrid || undefined,
        config,
    });

    const getDamagePreview = React.useCallback((attacker: TacticalEntity, target: TacticalEntity, skill: Skill): DamagePreview | null => {
        if (!skill.damage && !skill.pushDistance) return null;

        const rules = GameRulesManager.get();
        const isMagical = skill.effectType === 'magical';

        let baseDmg = skill.damage || 0;
        const weaponReplacement = skill.effects?.find(e => e.type === 'WEAPON_DAMAGE_REPLACEMENT' as any);
        if (weaponReplacement && attacker.equipped?.mainHand) {
            const weapon = attacker.equipped.mainHand;
            const weaponDmgEffect = weapon.effects?.find(e =>
                e.target === 'damage' || e.target === 'physical_damage' || e.type === 'COMBAT_BONUS' as any
            );
            if (weaponDmgEffect) {
                if (weaponDmgEffect.isPercentage) baseDmg = Math.floor(baseDmg * (1 + (weaponDmgEffect.value / 100)));
                else baseDmg = weaponDmgEffect.value;
            }
        }

        const minStrBonus = skill.pushDistance ? attacker.strength * (rules.combat.shovePushDamageRatio || 0.1) : attacker.strength * (rules.combat.strengthScalingMin || 0.2);
        const maxStrBonus = skill.pushDistance ? attacker.strength * (rules.combat.shovePushDamageRatio || 0.1) : attacker.strength * (rules.combat.strengthScalingMax || 0.4);

        const vMin = rules.combat.damageVarianceMin || 0.85;
        const vMax = rules.combat.damageVarianceMax || 1.15;

        // Critical Hit check
        const analyzedBonus = target.activeEffects?.filter(e => e.type === 'ANALYZED' as any).reduce((sum: number, e: any) => sum + (e.value || 0), 0) || 0;
        const finalCritChance = attacker.critChance + (analyzedBonus / 100);

        const calc = (str: number, v: number, crit: boolean) => {
            let d = Math.floor((baseDmg + str) * v);
            if (crit) d = Math.floor(d * 1.5);
            if (isMagical) {
                const resist = Math.floor(d * (target.resistance || 0));
                return Math.max(1, d - resist);
            } else {
                return Math.max(1, d - (target.defense || 0));
            }
        };

        return {
            min: calc(minStrBonus, vMin, false),
            max: calc(maxStrBonus, vMax, false),
            critMin: calc(minStrBonus, vMin, true),
            critMax: calc(maxStrBonus, vMax, true),
            isMagical,
            critChance: isNaN(finalCritChance) ? (attacker.critChance || 0) : finalCritChance
        };
    }, []);

    return (
        <TacticalArena
            grid={grid}
            entities={entities}
            turnOrder={turnOrder}
            activeEntityId={activeEntityId}
            activeEntity={activeEntity}
            isPlayerTurn={isPlayerTurn}
            phase={phase}
            playerAction={playerAction}
            logs={logs}
            turnNumber={turnNumber}
            onCellClick={handleCellClick}
            onEndTurn={endTurn}
            onSelectSkill={selectSkill}
            meleeAttackCost={MELEE_ATTACK_COST}
            selectedSkill={selectedSkill}
            battlemapUrl={battlemapUrl}
            getDamagePreview={getDamagePreview}
        />
    );
}
