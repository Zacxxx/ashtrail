import React, { useState } from 'react';
import { GameRegistry, Character, Skill, ALL_SKILLS } from '@ashtrail/core';
import { TacticalArena } from './TacticalArena';
import { useTacticalCombat, createTacticalEntity, TacticalEntity, CombatConfig } from './useTacticalCombat';
import { Grid, buildMapPrompt, parseAIGridResponse } from './tacticalGrid';
import { GameRulesManager } from '../rules/useGameRules';

// ── Default skills given to characters without their own ──
const DEFAULT_PLAYER_SKILLS: Skill[] = ALL_SKILLS.filter(s => ['slash', 'first-aid', 'fireball', 'shove', 'healing-pulse', 'piercing-shot'].includes(s.id));
const DEFAULT_ENEMY_SKILLS: Skill[] = ALL_SKILLS.filter(s => ['slash', 'quick-shot', 'power-strike', 'war-cry'].includes(s.id));

function mapCharToTactical(char: Character, isPlayer: boolean, index: number): TacticalEntity {
    const skills = char.skills && char.skills.length > 0
        ? char.skills
        : isPlayer ? DEFAULT_PLAYER_SKILLS : DEFAULT_ENEMY_SKILLS;

    return createTacticalEntity(
        `${char.id}_${isPlayer ? 'p' : 'e'}${index}`,
        isPlayer,
        char.name,
        char.stats.strength,
        char.stats.agility,
        char.stats.endurance,
        char.stats.intelligence,
        char.stats.wisdom,
        char.stats.charisma,
        Math.floor(char.stats.agility / 4), // Evasion from AGI
        Math.floor(char.stats.endurance / 2), // Defense from END
        0, // hp (engine will calculate)
        0, // maxHp (engine will calculate)
        char.traits,
        skills,
        { row: 0, col: 0 }
    );
}

function getMockTactical(isPlayer: boolean, index: number): TacticalEntity {
    const names = isPlayer
        ? ['The Vagabond', 'Iron Jess', 'Shade']
        : ['Ash Raider', 'Scorch', 'Fang'];
    return createTacticalEntity(
        `mock_${isPlayer ? 'p' : 'e'}${index}`,
        isPlayer,
        names[index % names.length],
        isPlayer ? 12 : 10,  // strength
        isPlayer ? 15 : 12,  // agility
        isPlayer ? 14 : 10,  // endurance
        isPlayer ? 10 : 8,   // intelligence
        isPlayer ? 8 : 10,   // wisdom
        isPlayer ? 12 : 8,   // charisma
        isPlayer ? 5 : 2,    // evasion
        isPlayer ? 2 : 1,    // defense
        0, 0, // hp, maxHp (engine will calc)
        [],
        isPlayer ? DEFAULT_PLAYER_SKILLS : DEFAULT_ENEMY_SKILLS,
        { row: 0, col: 0 }
    );
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
    const [playerIds, setPlayerIds] = useState<string[]>(['mock_1']);
    const [enemyIds, setEnemyIds] = useState<string[]>(['mock_2']);

    // AI Map
    const [mapPrompt, setMapPrompt] = useState('');
    const [aiGrid, setAiGrid] = useState<Grid | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [mapName, setMapName] = useState<string | null>(null);
    const [mapError, setMapError] = useState<string | null>(null);

    const updatePlayerCount = (count: number) => {
        setPlayerCount(count);
        setPlayerIds(prev => {
            const next = [...prev];
            while (next.length < count) next.push('mock_1');
            return next.slice(0, count);
        });
    };
    const updateEnemyCount = (count: number) => {
        setEnemyCount(count);
        setEnemyIds(prev => {
            const next = [...prev];
            while (next.length < count) next.push('mock_2');
            return next.slice(0, count);
        });
    };

    const setPlayerId = (index: number, id: string) => {
        setPlayerIds(prev => { const n = [...prev]; n[index] = id; return n; });
    };
    const setEnemyId = (index: number, id: string) => {
        setEnemyIds(prev => { const n = [...prev]; n[index] = id; return n; });
    };

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

    const startCombat = () => {
        setCombatKey(k => k + 1);
        setCombatStarted(true);
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
                                className="px-8 py-3 bg-orange-500 hover:bg-orange-400 text-black font-black uppercase tracking-[0.2em] rounded-xl text-sm transition-all shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40">
                                ⚔️ Start Combat
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
                />
            </div>
        </div>
    );
}

function TacticalCombatArena({
    playerIds, enemyIds, aiGrid, config,
}: {
    playerIds: string[];
    enemyIds: string[];
    aiGrid: Grid | null;
    config: CombatConfig;
}) {
    const playerEntities = playerIds.map((id, i) => {
        const char = GameRegistry.getCharacter(id);
        return char ? mapCharToTactical(char, true, i) : getMockTactical(true, i);
    });
    const enemyEntities = enemyIds.map((id, i) => {
        const char = GameRegistry.getCharacter(id);
        return char ? mapCharToTactical(char, false, i) : getMockTactical(false, i);
    });

    const {
        grid, entities, turnOrder, activeEntityId, activeEntity,
        isPlayerTurn, phase, playerAction, logs, turnNumber,
        handleCellClick, endTurn, selectSkill, selectedSkill, MELEE_ATTACK_COST,
    } = useTacticalCombat(playerEntities, enemyEntities, aiGrid || undefined, config);

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
        />
    );
}
