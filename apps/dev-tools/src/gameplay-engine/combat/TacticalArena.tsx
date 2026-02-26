// ═══════════════════════════════════════════════════════════
// TacticalArena.tsx — Dofus-style isometric combat arena
// ═══════════════════════════════════════════════════════════

import React, { useRef, useEffect, useMemo } from 'react';
import { Skill } from '@ashtrail/core';
import { Grid, GridCell, TILE_WIDTH, TILE_HEIGHT, gridToScreen } from './tacticalGrid';
import { TacticalEntity, CombatPhase, PlayerAction } from './useTacticalCombat';
import { CombatLogMessage } from './useCombatEngine';

interface TacticalArenaProps {
    grid: Grid;
    entities: Map<string, TacticalEntity>;
    turnOrder: string[];
    activeEntityId: string;
    isPlayerTurn: boolean;
    phase: CombatPhase;
    playerAction: PlayerAction;
    logs: CombatLogMessage[];
    turnNumber: number;
    onCellClick: (row: number, col: number) => void;
    onEndTurn: () => void;
    onSelectSkill: (skill: Skill | null) => void;
    activeEntity: TacticalEntity | undefined;
    meleeAttackCost: number;
    selectedSkill: Skill | null;
}

export function TacticalArena({
    grid, entities, turnOrder, activeEntityId, isPlayerTurn,
    phase, playerAction, logs, turnNumber,
    onCellClick, onEndTurn, onSelectSkill, activeEntity, meleeAttackCost, selectedSkill,
}: TacticalArenaProps) {
    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    // Calculate grid bounds for centering
    const gridBounds = useMemo(() => {
        const rows = grid.length;
        const cols = grid[0]?.length || 0;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const { x, y } = gridToScreen(r, c);
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x + TILE_WIDTH);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y + TILE_HEIGHT);
            }
        }
        return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
    }, [grid]);

    return (
        <div className="w-full h-full flex flex-col gap-0 overflow-hidden">
            {/* Top Bar: Turn info + Phase */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-black/60 border-b border-white/5">
                <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Turn {turnNumber}</span>
                    {phase === 'victory' && <span className="text-xs font-black text-green-400 uppercase tracking-widest animate-pulse">🏆 VICTORY</span>}
                    {phase === 'defeat' && <span className="text-xs font-black text-red-400 uppercase tracking-widest animate-pulse">💀 DEFEAT</span>}
                </div>
                {activeEntity && phase === 'combat' && (
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${activeEntity.isPlayer ? 'bg-blue-500' : 'bg-red-500'}`} />
                            <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">{activeEntity.name}</span>
                            {!isPlayerTurn && <span className="text-[9px] text-gray-500 italic">(AI thinking...)</span>}
                        </div>
                        <div className="flex gap-3 text-xs font-mono">
                            <span className="text-blue-400">AP: {activeEntity.ap}/{activeEntity.maxAp}</span>
                            <span className="text-green-400">MP: {activeEntity.mp}/{activeEntity.maxMp}</span>
                            <span className="text-red-400">HP: {activeEntity.hp}/{activeEntity.maxHp}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Main Content: Arena + Timeline */}
            <div className="flex-1 flex overflow-hidden">
                {/* Isometric Grid */}
                <div className="flex-1 relative overflow-hidden bg-[#0a0e14]">
                    <div
                        className="absolute"
                        style={{
                            left: '50%',
                            top: '50%',
                            transform: `translate(-${gridBounds.width / 2}px, -${gridBounds.height / 2}px) translate(${-gridBounds.minX}px, ${-gridBounds.minY}px)`,
                        }}
                    >
                        {grid.map((row, r) =>
                            row.map((cell, c) => {
                                const { x, y } = gridToScreen(r, c);
                                return (
                                    <IsometricTile
                                        key={`${r}-${c}`}
                                        cell={cell}
                                        x={x}
                                        y={y}
                                        entity={cell.occupantId ? entities.get(cell.occupantId) : undefined}
                                        isActive={cell.occupantId === activeEntityId}
                                        onClick={() => onCellClick(r, c)}
                                    />
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Turn Order Timeline */}
                <div className="w-[180px] shrink-0 bg-black/80 border-l border-white/5 flex flex-col overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/10">
                        <h3 className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Timeline</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {turnOrder.map((id) => {
                            const entity = entities.get(id);
                            if (!entity) return null;
                            const isDead = entity.hp <= 0;
                            const isActive = id === activeEntityId;
                            return (
                                <div
                                    key={id}
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded transition-all text-xs ${isDead ? 'opacity-30 line-through' :
                                            isActive ? 'bg-orange-500/20 border border-orange-500/50' :
                                                'border border-transparent hover:bg-white/5'
                                        }`}
                                >
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${entity.isPlayer ? 'bg-blue-500' : 'bg-red-500'}`} />
                                    <span className={`font-bold truncate ${isActive ? 'text-orange-400' : 'text-gray-400'}`}>
                                        {entity.name}
                                    </span>
                                    {!isDead && (
                                        <span className="ml-auto text-[9px] font-mono text-gray-600">{entity.hp}</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Bottom Panel: Skills + Actions + Log */}
            <div className="h-[200px] shrink-0 flex gap-0 border-t border-white/5">
                {/* Skills + Action Buttons */}
                <div className="w-[360px] p-3 bg-white/5 border-r border-white/5 flex flex-col gap-2 overflow-hidden">
                    <div className="flex justify-between items-center">
                        <h3 className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Actions</h3>
                        {playerAction === 'targeting_skill' && selectedSkill && (
                            <button onClick={() => onSelectSkill(null)} className="text-[9px] text-gray-400 hover:text-white transition-all">
                                ✕ Cancel
                            </button>
                        )}
                    </div>

                    {/* Skill Buttons Grid */}
                    {activeEntity && isPlayerTurn && phase === 'combat' && (
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                            {/* Skill buttons */}
                            <div className="grid grid-cols-2 gap-1">
                                {activeEntity.skills.map(skill => {
                                    const cd = activeEntity.skillCooldowns[skill.id] || 0;
                                    const canUse = activeEntity.ap >= skill.apCost && cd === 0;
                                    const isSelected = selectedSkill?.id === skill.id;
                                    return (
                                        <button
                                            key={skill.id}
                                            onClick={() => onSelectSkill(isSelected ? null : skill)}
                                            disabled={!canUse}
                                            title={`${skill.description}\nAP: ${skill.apCost} | Range: ${skill.minRange}-${skill.maxRange}${cd > 0 ? `\nCooldown: ${cd} turns` : ''}`}
                                            className={`text-left p-2 rounded-lg border text-[10px] transition-all ${isSelected
                                                    ? 'bg-orange-500/30 border-orange-500 text-orange-300'
                                                    : canUse
                                                        ? 'bg-black/40 border-white/10 hover:border-white/30 text-gray-300'
                                                        : 'bg-black/20 border-white/5 text-gray-600 opacity-50'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-1">
                                                <span className="font-bold truncate">
                                                    {skill.icon || '✨'} {skill.name}
                                                </span>
                                                <span className="text-[8px] font-mono text-blue-400 shrink-0">{skill.apCost}AP</span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {skill.damage && <span className="text-[8px] text-red-400">{skill.damage}dmg</span>}
                                                {skill.healing && <span className="text-[8px] text-green-400">{skill.healing}hp</span>}
                                                <span className="text-[8px] text-gray-600">r:{skill.minRange}-{skill.maxRange}</span>
                                                {cd > 0 && <span className="text-[8px] text-yellow-500">cd:{cd}</span>}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Basic actions */}
                            <div className="flex gap-1 mt-1">
                                <button
                                    onClick={onEndTurn}
                                    disabled={!isPlayerTurn || phase !== 'combat'}
                                    className="flex-1 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-30 text-black font-black uppercase tracking-widest rounded-lg text-[10px] transition-all"
                                >
                                    ⏭ End Turn
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Stats when it's not player's turn or combat ended */}
                    {(!isPlayerTurn || phase !== 'combat') && activeEntity && (
                        <div className="flex-1 flex items-center justify-center text-center">
                            {phase === 'combat' && <span className="text-xs text-gray-500 italic">Waiting for {activeEntity.name}...</span>}
                            {phase === 'victory' && <span className="text-xl">🏆</span>}
                            {phase === 'defeat' && <span className="text-xl">💀</span>}
                        </div>
                    )}
                </div>

                {/* Combat Log */}
                <div className="flex-1 p-3 bg-black/80 flex flex-col overflow-hidden font-mono text-xs">
                    <h3 className="text-[9px] font-black uppercase text-gray-500 tracking-widest border-b border-white/10 pb-1 mb-1 shrink-0">Combat Log</h3>
                    <div className="flex-1 overflow-y-auto space-y-0.5 pr-2 custom-scrollbar">
                        {logs.map(log => (
                            <div key={log.id} className={`py-0.5 ${log.type === 'system' ? 'text-teal-400 font-bold' :
                                    log.type === 'damage' ? 'text-red-400' :
                                        log.type === 'heal' ? 'text-green-400' : 'text-gray-400'
                                }`}>
                                <span className="text-gray-600 mr-1.5">»</span>
                                {log.message}
                            </div>
                        ))}
                        <div ref={logEndRef} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
// IsometricTile — A single diamond tile in the grid
// ═══════════════════════════════════════════════════════════

interface IsometricTileProps {
    cell: GridCell;
    x: number;
    y: number;
    entity?: TacticalEntity;
    isActive: boolean;
    onClick: () => void;
}

function IsometricTile({ cell, x, y, entity, isActive, onClick }: IsometricTileProps) {
    const isDead = entity && entity.hp <= 0;

    const halfW = TILE_WIDTH / 2;
    const halfH = TILE_HEIGHT / 2;
    const diamondPath = `M ${halfW} 0 L ${TILE_WIDTH} ${halfH} L ${halfW} ${TILE_HEIGHT} L 0 ${halfH} Z`;

    let fillColor = 'rgba(30, 40, 55, 0.6)';
    let strokeColor = 'rgba(255,255,255,0.08)';
    let strokeWidth = 0.5;

    if (!cell.walkable) {
        fillColor = 'rgba(15, 20, 30, 0.9)';
        strokeColor = 'rgba(255,255,255,0.03)';
    } else if (cell.isSpawnZone === 'player') {
        fillColor = 'rgba(59, 130, 246, 0.08)';
    } else if (cell.isSpawnZone === 'enemy') {
        fillColor = 'rgba(239, 68, 68, 0.08)';
    }

    if (cell.highlight === 'move') {
        fillColor = 'rgba(59, 130, 246, 0.25)';
        strokeColor = 'rgba(59, 130, 246, 0.5)';
        strokeWidth = 1;
    } else if (cell.highlight === 'attack') {
        fillColor = 'rgba(239, 68, 68, 0.25)';
        strokeColor = 'rgba(239, 68, 68, 0.5)';
        strokeWidth = 1;
    } else if (cell.highlight === 'path') {
        fillColor = 'rgba(234, 179, 8, 0.3)';
        strokeColor = 'rgba(234, 179, 8, 0.6)';
        strokeWidth = 1;
    }

    if (isActive && entity) {
        strokeColor = 'rgba(249, 115, 22, 0.8)';
        strokeWidth = 2;
    }

    return (
        <div
            className="absolute cursor-pointer group"
            style={{ left: x, top: y, width: TILE_WIDTH, height: TILE_HEIGHT }}
            onClick={onClick}
        >
            <svg width={TILE_WIDTH} height={TILE_HEIGHT} className="absolute inset-0">
                <path
                    d={diamondPath}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    className="transition-all duration-150 group-hover:brightness-150"
                />
            </svg>

            {!cell.walkable && (
                <svg width={TILE_WIDTH} height={TILE_HEIGHT + 8} className="absolute" style={{ top: -8 }}>
                    <path d={`M ${halfW} 0 L ${TILE_WIDTH} ${halfH} L ${halfW} ${TILE_HEIGHT} L 0 ${halfH} Z`}
                        fill="rgba(25, 30, 40, 0.95)" stroke="rgba(255,255,255,0.05)" strokeWidth={0.5}
                        style={{ transform: 'translateY(-4px)' }}
                    />
                    <path d={`M 0 ${halfH - 4} L ${halfW} ${TILE_HEIGHT - 4} L ${halfW} ${TILE_HEIGHT + 4} L 0 ${halfH + 4} Z`}
                        fill="rgba(15, 20, 28, 0.95)" stroke="rgba(255,255,255,0.03)" strokeWidth={0.5}
                    />
                    <path d={`M ${TILE_WIDTH} ${halfH - 4} L ${halfW} ${TILE_HEIGHT - 4} L ${halfW} ${TILE_HEIGHT + 4} L ${TILE_WIDTH} ${halfH + 4} Z`}
                        fill="rgba(20, 25, 35, 0.95)" stroke="rgba(255,255,255,0.03)" strokeWidth={0.5}
                    />
                </svg>
            )}

            {entity && !isDead && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: -12 }}>
                    <div className={`
                        w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-black
                        shadow-lg transition-all duration-300
                        ${entity.isPlayer
                            ? 'bg-blue-600 border-blue-400 text-white shadow-blue-500/40'
                            : 'bg-red-600 border-red-400 text-white shadow-red-500/40'
                        }
                        ${isActive ? 'scale-125 ring-2 ring-orange-400 ring-offset-1 ring-offset-transparent' : ''}
                    `}>
                        {entity.name.charAt(0)}
                    </div>
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-black/80 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ${entity.hp / entity.maxHp > 0.5 ? 'bg-green-500' :
                                    entity.hp / entity.maxHp > 0.25 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                            style={{ width: `${Math.max(0, (entity.hp / entity.maxHp) * 100)}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
