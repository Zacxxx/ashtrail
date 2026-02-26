import React, { useRef, useEffect, useState } from 'react';
import { useCombatEngine, CombatEntity } from './useCombatEngine';
import { GameRegistry, Character } from '@ashtrail/core';

function mapCharToEntity(char: Character, isPlayer: boolean): CombatEntity {
    return {
        id: char.id + (isPlayer ? '_p1' : '_p2'),
        isPlayer,
        name: char.name,
        hp: char.maxHp, // Full health for simulator purposes
        maxHp: char.maxHp,
        strength: char.stats.strength,
        agility: char.stats.agility,
        evasion: 5 + Math.floor(char.stats.agility / 2),
        defense: Math.floor(char.stats.endurance / 2),
        traits: char.traits
    };
}

// Fallback mocks if no characters exist
function getMockEntity(isPlayer: boolean): CombatEntity {
    return {
        id: isPlayer ? 'mock_p1' : 'mock_p2',
        isPlayer,
        name: isPlayer ? 'The Vagabond' : 'Ash Raider',
        hp: isPlayer ? 100 : 80,
        maxHp: isPlayer ? 100 : 80,
        strength: isPlayer ? 12 : 10,
        agility: isPlayer ? 15 : 12,
        evasion: 5,
        defense: isPlayer ? 2 : 1,
        traits: []
    };
}

export function CombatSimulator() {
    const chars = GameRegistry.getAllCharacters();
    const [p1Id, setP1Id] = useState<string>(chars.length > 0 ? chars[0].id : 'mock_1');
    const [p2Id, setP2Id] = useState<string>(chars.length > 1 ? chars[1].id : (chars.length > 0 ? chars[0].id : 'mock_2'));

    // If characters update or we add one, we might want to refresh. 
    // For now we assume they are static while on this page, or we fetch them on mount.

    return (
        <div className="w-full h-full max-w-[1200px] flex flex-col gap-6 p-8 bg-black/40 border border-white/5 rounded-2xl relative shadow-2xl">
            {/* Header & Controls */}
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
                <h2 className="text-xl font-black uppercase tracking-[0.2em] text-orange-500">
                    Combat Simulator
                </h2>

                <div className="flex gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Player 1</label>
                        <select
                            value={p1Id}
                            onChange={e => setP1Id(e.target.value)}
                            className="bg-black/50 border border-white/10 text-white text-xs px-3 py-1.5 rounded outline-none w-48 font-mono"
                        >
                            <option value="mock_1">Default Player</option>
                            {chars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Player 2 (Enemy)</label>
                        <select
                            value={p2Id}
                            onChange={e => setP2Id(e.target.value)}
                            className="bg-black/50 border border-white/10 text-white text-xs px-3 py-1.5 rounded outline-none w-48 font-mono"
                        >
                            <option value="mock_2">Default Enemy</option>
                            {chars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Arena keyed by selections to force full reset of combat engine on change */}
            <CombatArena key={`${p1Id}-${p2Id}`} p1Id={p1Id} p2Id={p2Id} />
        </div>
    );
}

function CombatArena({ p1Id, p2Id }: { p1Id: string, p2Id: string }) {
    const c1 = GameRegistry.getCharacter(p1Id);
    const c2 = GameRegistry.getCharacter(p2Id);

    const playerEntity = c1 ? mapCharToEntity(c1, true) : getMockEntity(true);
    const enemyEntity = c2 ? mapCharToEntity(c2, false) : getMockEntity(false);

    const {
        player, enemy, turn, logs,
        activeEntityId, combatEnded, handlePlayerAttack
    } = useCombatEngine(playerEntity, enemyEntity);

    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    return (
        <>
            {/* Turn Counter Overlay */}
            <div className="absolute top-8 right-8 px-4 py-1 rounded bg-white/5 border border-white/10 text-xs font-mono text-gray-400">
                Turn: {turn}
            </div>

            {/* Arena View */}
            <div className="flex-1 flex justify-between items-center gap-12 px-8 py-4">

                {/* Player Frame */}
                <div className={`flex flex-col gap-4 p-6 rounded-xl border transition-all ${activeEntityId === player.id ? 'border-orange-500 bg-orange-500/10 shadow-[0_0_20px_rgba(249,115,22,0.2)]' : 'border-white/10 bg-black/50'}`}>
                    <div className="flex justify-between items-start w-[240px]">
                        <div className="flex flex-col">
                            <span className="text-xs text-orange-500 font-bold uppercase tracking-widest">{activeEntityId === player.id ? '▶ ACTING' : 'WAITING'}</span>
                            <span className="text-2xl font-black text-gray-100">{player.name}</span>
                        </div>
                    </div>
                    {/* HP Bar */}
                    <div className="flex flex-col gap-1 w-full">
                        <div className="flex justify-between text-xs font-mono font-bold">
                            <span className="text-red-400">HP</span>
                            <span className="text-gray-300">{player.hp} / {player.maxHp}</span>
                        </div>
                        <div className="w-full h-3 bg-red-950 rounded overflow-hidden p-0.5 border border-red-900/50">
                            <div className="h-full bg-red-500 rounded-sm transition-all duration-500" style={{ width: `${Math.max(0, (player.hp / player.maxHp)) * 100}%` }} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-4">
                        <div className="p-2 border border-white/5 bg-white/5 rounded text-[10px] font-mono"><span className="text-gray-500">STR:</span> {player.strength}</div>
                        <div className="p-2 border border-white/5 bg-white/5 rounded text-[10px] font-mono"><span className="text-gray-500">AGI:</span> {player.agility}</div>
                        <div className="p-2 border border-white/5 bg-white/5 rounded text-[10px] font-mono"><span className="text-gray-500">EVA:</span> {player.evasion}%</div>
                        <div className="p-2 border border-white/5 bg-white/5 rounded text-[10px] font-mono"><span className="text-gray-500">DEF:</span> {player.defense}</div>
                    </div>
                </div>

                {/* VS Marker */}
                <div className="text-4xl font-black text-white/10 italic">VS</div>

                {/* Enemy Frame */}
                <div className={`flex flex-col gap-4 p-6 rounded-xl border transition-all ${activeEntityId === enemy.id ? 'border-red-500 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 'border-white/10 bg-black/50'}`}>
                    <div className="flex justify-between items-start w-[240px]">
                        <div className="flex flex-col">
                            <span className="text-xs text-red-500 font-bold uppercase tracking-widest">{activeEntityId === enemy.id ? '▶ ACTING' : 'WAITING'}</span>
                            <span className="text-2xl font-black text-gray-100">{enemy.name}</span>
                        </div>
                    </div>
                    {/* HP Bar */}
                    <div className="flex flex-col gap-1 w-full">
                        <div className="flex justify-between text-xs font-mono font-bold">
                            <span className="text-red-400">HP</span>
                            <span className="text-gray-300">{enemy.hp} / {enemy.maxHp}</span>
                        </div>
                        <div className="w-full h-3 bg-red-950 rounded overflow-hidden p-0.5 border border-red-900/50">
                            <div className="h-full bg-red-500 rounded-sm transition-all duration-500" style={{ width: `${Math.max(0, (enemy.hp / enemy.maxHp)) * 100}%` }} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-4">
                        <div className="p-2 border border-white/5 bg-white/5 rounded text-[10px] font-mono"><span className="text-gray-500">STR:</span> {enemy.strength}</div>
                        <div className="p-2 border border-white/5 bg-white/5 rounded text-[10px] font-mono"><span className="text-gray-500">AGI:</span> {enemy.agility}</div>
                        <div className="p-2 border border-white/5 bg-white/5 rounded text-[10px] font-mono"><span className="text-gray-500">EVA:</span> {enemy.evasion}%</div>
                        <div className="p-2 border border-white/5 bg-white/5 rounded text-[10px] font-mono"><span className="text-gray-500">DEF:</span> {enemy.defense}</div>
                    </div>
                </div>
            </div>

            {/* Bottom Panel (Controls & Log) */}
            <div className="h-[200px] flex gap-4">
                {/* Actions */}
                <div className="w-[300px] p-4 bg-white/5 border border-white/10 rounded-xl flex flex-col gap-2">
                    <h3 className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-2 border-b border-white/10 pb-2">Actions</h3>
                    <button
                        onClick={handlePlayerAttack}
                        disabled={activeEntityId !== player.id || combatEnded}
                        className="w-full py-3 bg-orange-500 hover:bg-orange-400 disabled:opacity-30 disabled:hover:bg-orange-500 text-black font-black uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 transition-all"
                    >
                        <span>⚔️</span> Attack
                    </button>
                    <button
                        disabled={true}
                        className="w-full py-3 bg-white/10 text-gray-500 font-bold uppercase tracking-widest rounded-lg cursor-not-allowed text-xs"
                    >
                        Defend (WIP)
                    </button>
                </div>

                {/* Combat Log */}
                <div className="flex-1 p-4 bg-black/80 border border-white/10 rounded-xl flex flex-col overflow-hidden font-mono text-xs">
                    <h3 className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-2 border-b border-white/10 pb-2 shrink-0">Combat Log</h3>
                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {logs.map(log => (
                            <div key={log.id} className={`py-1 ${log.type === 'system' ? 'text-teal-400 font-bold' :
                                log.type === 'damage' ? 'text-red-400' :
                                    log.type === 'heal' ? 'text-green-400' : 'text-gray-300'
                                }`}>
                                <span className="text-gray-600 mr-2">»</span>
                                {log.message}
                            </div>
                        ))}
                        <div ref={logEndRef} />
                    </div>
                </div>
            </div>
        </>
    );
}
