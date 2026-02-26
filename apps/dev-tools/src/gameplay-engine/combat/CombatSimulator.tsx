import React, { useState } from 'react';
import { GameRegistry, Character } from '@ashtrail/core';
import { TacticalArena } from './TacticalArena';
import { useTacticalCombat, createTacticalEntity, TacticalEntity } from './useTacticalCombat';
import { Grid, buildMapPrompt, parseAIGridResponse } from './tacticalGrid';

function mapCharToTactical(char: Character, isPlayer: boolean, defaultPos: { row: number; col: number }): TacticalEntity {
    return createTacticalEntity(
        char.id + (isPlayer ? '_p1' : '_e1'),
        isPlayer,
        char.name,
        char.stats.strength,
        char.stats.agility,
        5 + Math.floor(char.stats.agility / 2),
        Math.floor(char.stats.endurance / 2),
        char.maxHp,
        char.maxHp,
        char.traits,
        defaultPos
    );
}

function getMockTactical(isPlayer: boolean): TacticalEntity {
    return createTacticalEntity(
        isPlayer ? 'mock_p1' : 'mock_e1',
        isPlayer,
        isPlayer ? 'The Vagabond' : 'Ash Raider',
        isPlayer ? 12 : 10,
        isPlayer ? 15 : 12,
        5,
        isPlayer ? 2 : 1,
        isPlayer ? 100 : 80,
        isPlayer ? 100 : 80,
        [],
        { row: 0, col: 0 }
    );
}

export function CombatSimulator() {
    const chars = GameRegistry.getAllCharacters();
    const [p1Id, setP1Id] = useState<string>(chars.length > 0 ? chars[0].id : 'mock_1');
    const [p2Id, setP2Id] = useState<string>(chars.length > 1 ? chars[1].id : (chars.length > 0 ? chars[0].id : 'mock_2'));
    const [combatKey, setCombatKey] = useState(0);

    // AI Map Generation
    const [mapPrompt, setMapPrompt] = useState('');
    const [aiGrid, setAiGrid] = useState<Grid | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [mapName, setMapName] = useState<string | null>(null);
    const [mapError, setMapError] = useState<string | null>(null);

    const generateAIMap = async () => {
        if (!mapPrompt.trim() || isGenerating) return;
        setIsGenerating(true);
        setMapError(null);
        setMapName(null);

        try {
            const prompt = buildMapPrompt(mapPrompt.trim());
            const res = await fetch('http://127.0.0.1:8787/api/text/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
            });

            if (!res.ok) {
                throw new Error(`API error: ${res.status}`);
            }

            const data = await res.json();
            const text = data.text || data.result || (typeof data === 'string' ? data : JSON.stringify(data));

            const grid = parseAIGridResponse(text);
            if (grid) {
                setAiGrid(grid);
                // Try to extract name from the response
                try {
                    let cleaned = text.trim();
                    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
                    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
                    const parsed = JSON.parse(cleaned);
                    setMapName(parsed.name || null);
                } catch { }
                setCombatKey(k => k + 1);
            } else {
                setMapError('Failed to parse AI response into a valid grid. Try again.');
            }
        } catch (e: any) {
            setMapError(e.message || 'Unknown error');
        } finally {
            setIsGenerating(false);
        }
    };

    const startRandomCombat = () => {
        setAiGrid(null);
        setMapName(null);
        setMapError(null);
        setCombatKey(k => k + 1);
    };

    return (
        <div className="w-full h-full flex flex-col gap-0 bg-black/40 border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
            {/* Header: Character Selection + Map Generation */}
            <div className="shrink-0 flex flex-col border-b border-white/5 bg-black/60">
                {/* Row 1: Characters + Fight */}
                <div className="flex items-center justify-between px-5 py-2.5">
                    <h2 className="text-sm font-black uppercase tracking-[0.2em] text-orange-500">
                        Tactical Combat
                    </h2>
                    <div className="flex gap-4 items-end">
                        <div className="flex flex-col gap-0.5">
                            <label className="text-[9px] text-gray-500 uppercase tracking-widest font-black">Player</label>
                            <select
                                value={p1Id}
                                onChange={e => setP1Id(e.target.value)}
                                className="bg-black/50 border border-white/10 text-white text-[11px] px-2 py-1 rounded outline-none w-36 font-mono"
                            >
                                <option value="mock_1">Default Player</option>
                                {chars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <span className="text-xs font-black text-white/10 pb-1">VS</span>
                        <div className="flex flex-col gap-0.5">
                            <label className="text-[9px] text-gray-500 uppercase tracking-widest font-black">Enemy</label>
                            <select
                                value={p2Id}
                                onChange={e => setP2Id(e.target.value)}
                                className="bg-black/50 border border-white/10 text-white text-[11px] px-2 py-1 rounded outline-none w-36 font-mono"
                            >
                                <option value="mock_2">Default Enemy</option>
                                {chars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <button
                            onClick={startRandomCombat}
                            className="px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 font-bold uppercase tracking-widest rounded text-[10px] transition-all"
                        >
                            🎲 Random Map
                        </button>
                    </div>
                </div>

                {/* Row 2: AI Map Generator */}
                <div className="flex items-center gap-3 px-5 py-2 border-t border-white/5 bg-black/30">
                    <div className="flex items-center gap-2 flex-1">
                        <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest shrink-0">AI Map</span>
                        <input
                            value={mapPrompt}
                            onChange={e => setMapPrompt(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') generateAIMap(); }}
                            placeholder="Describe a battlefield... (e.g. 'ruined temple with pillars and a central altar')"
                            className="flex-1 bg-black/50 border border-white/10 text-white text-xs px-3 py-1.5 rounded outline-none focus:border-indigo-500/50 transition-all placeholder:text-gray-600"
                            disabled={isGenerating}
                        />
                        <button
                            onClick={generateAIMap}
                            disabled={isGenerating || !mapPrompt.trim()}
                            className="px-4 py-1.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-30 text-white font-black uppercase tracking-widest rounded text-[10px] transition-all flex items-center gap-1.5 shrink-0"
                        >
                            {isGenerating ? (
                                <>
                                    <span className="animate-spin">⟳</span> Generating...
                                </>
                            ) : (
                                <>✨ Generate</>
                            )}
                        </button>
                    </div>
                    {mapName && (
                        <span className="text-[10px] text-indigo-400 font-mono bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 shrink-0">
                            {mapName}
                        </span>
                    )}
                    {mapError && (
                        <span className="text-[10px] text-red-400 font-mono shrink-0">
                            ⚠ {mapError}
                        </span>
                    )}
                </div>
            </div>

            {/* Arena (keyed to force full reset) */}
            <div className="flex-1 overflow-hidden">
                <TacticalCombatArena key={`combat-${combatKey}-${p1Id}-${p2Id}`} p1Id={p1Id} p2Id={p2Id} aiGrid={aiGrid} />
            </div>
        </div>
    );
}

function TacticalCombatArena({ p1Id, p2Id, aiGrid }: { p1Id: string; p2Id: string; aiGrid: Grid | null }) {
    const c1 = GameRegistry.getCharacter(p1Id);
    const c2 = GameRegistry.getCharacter(p2Id);

    const playerEntity = c1 ? mapCharToTactical(c1, true, { row: 0, col: 0 }) : getMockTactical(true);
    const enemyEntity = c2 ? mapCharToTactical(c2, false, { row: 0, col: 0 }) : getMockTactical(false);

    const {
        grid, entities, turnOrder, activeEntityId, activeEntity,
        isPlayerTurn, phase, playerAction, logs, turnNumber,
        handleCellClick, endTurn, MELEE_ATTACK_COST,
    } = useTacticalCombat([playerEntity], [enemyEntity], aiGrid || undefined);

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
            meleeAttackCost={MELEE_ATTACK_COST}
        />
    );
}
