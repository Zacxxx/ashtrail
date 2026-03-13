// ═══════════════════════════════════════════════════════════
// TacticalArena.tsx — Dofus-style isometric combat arena
// ═══════════════════════════════════════════════════════════

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Skill } from '@ashtrail/core';
import type { TacticalEntity, CombatPhase, CombatLogMessage, CombatPreviewState, DamagePreview } from '@ashtrail/core';
import { Grid, GridCell, TILE_WIDTH, TILE_HEIGHT, gridToScreen, findPath } from './tacticalGrid';
import type { PlayerAction } from './useCombatWebSocket';
import { GameRulesManager } from '../rules/useGameRules';

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
    battlemapUrl?: string | null;
    previewState: CombatPreviewState;
    onPreviewMove: (entityId: string, hoverRow?: number, hoverCol?: number) => void;
    onPreviewBasicAttack: (attackerId: string, hoverRow?: number, hoverCol?: number) => void;
    onPreviewSkill: (casterId: string, skillId: string, hoverRow?: number, hoverCol?: number) => void;
}

export function TacticalArena({
    grid, entities, turnOrder, activeEntityId, isPlayerTurn,
    phase, playerAction, logs, turnNumber,
    onCellClick, onEndTurn, onSelectSkill, activeEntity, meleeAttackCost,
    selectedSkill,
    battlemapUrl,
    previewState,
    onPreviewMove,
    onPreviewBasicAttack,
    onPreviewSkill
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

    const [hoveredCell, setHoveredCell] = useState<{ row: number, col: number } | null>(null);
    const [battlemapLoaded, setBattlemapLoaded] = useState(false);
    const [isHotbarUnlocked, setIsHotbarUnlocked] = useState(false);
    const [skillOrders, setSkillOrders] = useState<Record<string, (Skill | null)[]>>({});
    const [hoveredDragSlot, setHoveredDragSlot] = useState<number | null>(null);

    useEffect(() => {
        setBattlemapLoaded(false);
    }, [battlemapUrl]);

    const currentSkills = useMemo(() => {
        if (!activeEntity) return Array.from({ length: 20 }, () => null);
        if (skillOrders[activeEntity.id]) return skillOrders[activeEntity.id];
        const arr = Array.from({ length: 20 }, () => null) as (Skill | null)[];
        activeEntity.skills.forEach((s, idx) => { if (idx < 20) arr[idx] = s; });
        return arr;
    }, [activeEntity, skillOrders]);

    const handleSwapSkills = (idx1: number, idx2: number) => {
        if (!activeEntity) return;
        setSkillOrders(prev => {
            const current = [...(prev[activeEntity.id] || currentSkills)];
            const temp = current[idx1];
            current[idx1] = current[idx2];
            current[idx2] = temp;
            return { ...prev, [activeEntity.id]: current };
        });
    };

    const handleDragStart = (e: React.DragEvent, idx: number) => {
        if (!isHotbarUnlocked) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('text/plain', idx.toString());
    };

    const handleDrop = (e: React.DragEvent, idx2: number) => {
        if (!isHotbarUnlocked) return;
        e.preventDefault();
        const idx1Str = e.dataTransfer.getData('text/plain');
        if (idx1Str) {
            const idx1 = parseInt(idx1Str, 10);
            if (idx1 !== idx2 && !isNaN(idx1)) handleSwapSkills(idx1, idx2);
        }
        setHoveredDragSlot(null);
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (!isHotbarUnlocked) return;
        e.preventDefault();
    };

    const aoeSet = useMemo(() => {
        const set = new Set<string>();
        previewState.aoeCells.forEach((cell) => set.add(`${cell.row},${cell.col}`));
        return set;
    }, [previewState.aoeCells]);

    const targetPreviewMap = useMemo(() => {
        const map = new Map<string, CombatPreviewState['targetPreviews'][number]['preview']>();
        previewState.targetPreviews.forEach((target) => {
            map.set(target.entityId, target.preview);
        });
        return map;
    }, [previewState.targetPreviews]);

    const displayGrid = useMemo(() => {
        const newGrid = grid.map(row => row.map(cell => ({ ...cell, highlight: null as 'move' | 'attack' | 'attack-blocked' | 'path' | null })));
        previewState.reachableCells.forEach((cell) => {
            newGrid[cell.row][cell.col].highlight = 'move';
        });
        previewState.attackableCells.forEach((cell) => {
            newGrid[cell.row][cell.col].highlight = 'attack';
        });
        previewState.blockedCells.forEach((cell) => {
            newGrid[cell.row][cell.col].highlight = 'attack-blocked';
        });
        previewState.pathCells.forEach((cell) => {
            newGrid[cell.row][cell.col].highlight = 'path';
        });

        return newGrid;
    }, [grid, previewState]);

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
                            width: gridBounds.width,
                            height: gridBounds.height,
                            transform: `translate(-${gridBounds.width / 2}px, -${gridBounds.height / 2}px) translate(${-gridBounds.minX}px, ${-gridBounds.minY}px)`,
                        }}
                    >
                        {/* Battlemap Layer */}
                        {battlemapUrl && (
                            <img
                                src={battlemapUrl}
                                alt="Battlemap"
                                className="pointer-events-none"
                                onLoad={() => setBattlemapLoaded(true)}
                                onError={() => setBattlemapLoaded(false)}
                                style={{
                                    position: 'absolute',
                                    left: gridBounds.minX,
                                    top: gridBounds.minY,
                                    width: gridBounds.width,
                                    height: gridBounds.height,
                                    opacity: 0.85,
                                    zIndex: 0,
                                    objectFit: 'cover',
                                    clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                                }}
                            />
                        )}

                        {displayGrid.map((row, r) =>
                            row.map((cell, c) => {
                                const { x, y } = gridToScreen(r, c);
                                const occupant = cell.occupantId ? entities.get(cell.occupantId) : undefined;
                                const isHoveredTile = hoveredCell?.row === r && hoveredCell?.col === c;
                                const error = isHoveredTile ? previewState.hoveredError || "" : "";
                                const damagePreview = occupant ? targetPreviewMap.get(occupant.id) || null : null;

                                return (
                                    <IsometricTile
                                        key={`${r}-${c}`}
                                        cell={cell}
                                        x={x}
                                        y={y}
                                        entity={occupant}
                                        isActive={cell.occupantId === activeEntityId}
                                        isAoe={aoeSet.has(`${r},${c}`)}
                                        hasBattlemap={!!battlemapUrl && battlemapLoaded}
                                        onClick={() => {
                                            if (error) return; // Block clicking
                                            onCellClick(r, c);
                                        }}
                                        onHover={() => {
                                            setHoveredCell({ row: r, col: c });
                                            if (!activeEntity || !isPlayerTurn || phase !== 'combat') return;
                                            if (selectedSkill) {
                                                onPreviewSkill(activeEntity.id, selectedSkill.id, r, c);
                                                return;
                                            }
                                            if (occupant && occupant.id !== activeEntity.id && occupant.isPlayer !== activeEntity.isPlayer) {
                                                onPreviewBasicAttack(activeEntity.id, r, c);
                                                return;
                                            }
                                            if (occupant) {
                                                onPreviewMove(activeEntity.id);
                                                return;
                                            }
                                            onPreviewMove(activeEntity.id, r, c);
                                        }}
                                        onLeave={() => {
                                            setHoveredCell(null);
                                            if (!activeEntity || !isPlayerTurn || phase !== 'combat') return;
                                            if (selectedSkill) {
                                                onPreviewSkill(activeEntity.id, selectedSkill.id);
                                            } else {
                                                onPreviewMove(activeEntity.id);
                                            }
                                        }}
                                        errorMessage={error}
                                        damagePreview={damagePreview}
                                    />
                                );
                            })
                        )}

                        {/* Entities Layer */}
                        {Array.from(entities.values()).map(entity => (
                            <TacticalEntityView
                                key={entity.id}
                                entity={entity}
                                grid={grid}
                                isActive={entity.id === activeEntityId}
                            />
                        ))}
                    </div>
                </div>

                {/* Turn Order Timeline & Actions Panel */}
                <div className="w-[320px] shrink-0 bg-black/80 border-l border-white/5 flex flex-col overflow-hidden">
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
                {/* Actions / Spell Bar HUD (Dofus Style) */}
                <div className="flex-1 p-0 bg-black/90 flex flex-col justify-end items-center relative overflow-visible bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-slate-900 via-black to-black border-r border-white/5">
                    {/* Targeting Cancel Bar */}
                    {playerAction === 'targeting_skill' && selectedSkill && (
                        <div className="absolute top-0 left-0 w-full bg-orange-500/20 text-orange-400 text-xs py-1.5 text-center font-bold tracking-widest border-b border-orange-500/50 flex justify-center items-center gap-4 z-10 shadow-lg">
                            Targeting: {selectedSkill.name}
                            <button onClick={() => onSelectSkill(null)} className="px-3 py-0.5 bg-black/50 hover:bg-orange-500 hover:text-black rounded border border-orange-500 text-white transition-all uppercase text-[10px]">
                                ✕ Cancel
                            </button>
                        </div>
                    )}

                    {activeEntity && isPlayerTurn && phase === 'combat' && (
                        <div className="w-full max-w-5xl px-4 flex flex-col items-center justify-center gap-4 h-full">

                            {/* HUD: Stats */}
                            <div className="flex items-center gap-8 px-8 py-2 bg-black/80 rounded-full border border-white/10 shadow-2xl backdrop-blur-sm relative z-0">
                                <div className="flex items-baseline gap-1" title="Health Points">
                                    <span className="text-red-500 text-sm font-black mr-1">❤️</span>
                                    <span className="text-white font-black text-xl">{activeEntity.hp}</span>
                                    <span className="text-gray-500 text-xs font-bold">/ {activeEntity.maxHp}</span>
                                </div>
                                <div className="w-px h-6 bg-white/10" />
                                <div className="flex items-baseline gap-1" title="Action Points">
                                    <span className="text-blue-400 text-sm font-black mr-1">⭐</span>
                                    <span className="text-white font-black text-xl">{activeEntity.ap}</span>
                                    <span className="text-blue-500/50 text-xs font-bold uppercase">ap</span>
                                </div>
                                <div className="w-px h-6 bg-white/10" />
                                <div className="flex items-baseline gap-1" title="Movement Points">
                                    <span className="text-green-400 text-sm font-black mr-1">👟</span>
                                    <span className="text-white font-black text-xl">{activeEntity.mp}</span>
                                    <span className="text-green-500/50 text-xs font-bold uppercase">mp</span>
                                </div>
                            </div>

                            {/* Hotbar */}
                            <div className="flex items-center gap-6 w-full justify-center">
                                {/* Skills */}
                                <div className="relative group/hotbar">
                                    <button
                                        onClick={() => setIsHotbarUnlocked(!isHotbarUnlocked)}
                                        className={`absolute -left-3 -top-3 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] z-[60] transition-all shadow-lg ${isHotbarUnlocked
                                            ? 'bg-orange-500 border-orange-300 text-black animate-pulse'
                                            : 'bg-gray-700 border-gray-500 text-gray-400 hover:bg-gray-600 hover:text-white'}`}
                                        title={isHotbarUnlocked ? "Lock Hotbar" : "Unlock Hotbar"}
                                    >
                                        {isHotbarUnlocked ? '🔓' : '🔒'}
                                    </button>
                                    <div className={`grid grid-cols-10 grid-rows-2 gap-2 bg-black/40 p-3 rounded-2xl border transition-colors shadow-inner backdrop-blur-md ${isHotbarUnlocked ? 'border-orange-500/50 outline-dashed outline-1 outline-orange-500/50 outline-offset-4' : 'border-white/10'}`}>
                                        {currentSkills.map((skill, idx) => {
                                            const isDragHovered = hoveredDragSlot === idx;

                                            // Empty slot
                                            if (!skill) {
                                                return (
                                                    <div
                                                        key={`empty-${idx}`}
                                                        onDragOver={handleDragOver}
                                                        onDrop={(e) => handleDrop(e, idx)}
                                                        onDragEnter={(e) => { if (isHotbarUnlocked) { e.preventDefault(); setHoveredDragSlot(idx); } }}
                                                        onDragLeave={(e) => { if (isHotbarUnlocked) { e.preventDefault(); setHoveredDragSlot(null); } }}
                                                        className={`w-12 h-12 rounded-lg border-2 transition-colors duration-200 ${isDragHovered ? 'border-orange-500 bg-orange-500/20' : 'border-white/5 bg-black/20'} shadow-inner`}
                                                    />
                                                );
                                            }

                                            const cd = activeEntity.skillCooldowns[skill.id] || 0;
                                            const canUse = activeEntity.ap >= skill.apCost && cd === 0;
                                            const isSelected = selectedSkill?.id === skill.id;
                                            return (
                                                <button
                                                    key={`${skill.id}-${idx}`}
                                                    onClick={() => !isHotbarUnlocked && onSelectSkill(isSelected ? null : skill)}
                                                    disabled={!isHotbarUnlocked && !canUse}
                                                    draggable={isHotbarUnlocked}
                                                    onDragStart={(e) => handleDragStart(e, idx)}
                                                    onDragOver={handleDragOver}
                                                    onDrop={(e) => handleDrop(e, idx)}
                                                    onDragEnter={(e) => { if (isHotbarUnlocked) { e.preventDefault(); setHoveredDragSlot(idx); } }}
                                                    onDragLeave={(e) => { if (isHotbarUnlocked) { e.preventDefault(); setHoveredDragSlot(null); } }}
                                                    className={`relative group/skill w-12 h-12 rounded-lg border-2 flex items-center justify-center text-xl transition-all duration-200 
                                                        ${isDragHovered ? 'border-orange-500 scale-105 z-20' : ''}
                                                        ${isSelected && !isHotbarUnlocked
                                                            ? 'bg-orange-500/40 border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.5)] scale-110 z-10'
                                                            : (canUse || isHotbarUnlocked)
                                                                ? 'bg-gradient-to-br from-slate-700 to-slate-900 border-slate-600 hover:border-slate-400 hover:scale-110 z-0 hover:z-20'
                                                                : 'bg-slate-900/50 border-slate-800 opacity-50 grayscale'
                                                        }
                                                        ${isHotbarUnlocked ? 'cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-orange-500/50' : ''}
                                                    `}
                                                >
                                                    {skill.icon || '✨'}

                                                    {/* AP Cost Badge */}
                                                    <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 bg-blue-600 rounded-full border-2 border-black flex items-center justify-center text-[9px] font-black text-white shadow-md">
                                                        {skill.apCost}
                                                    </div>

                                                    {/* Cooldown Overlay */}
                                                    {cd > 0 && (
                                                        <div className="absolute inset-0 bg-black/70 rounded-md flex items-center justify-center font-black text-yellow-500 text-lg backdrop-blur-[1px]">
                                                            {cd}
                                                        </div>
                                                    )}

                                                    {/* Dofus Style Tooltip (Hover) */}
                                                    <div className="absolute bottom-[110%] mb-2 left-1/2 -translate-x-1/2 w-48 p-2.5 bg-slate-900/95 backdrop-blur-md border border-slate-600 rounded-xl shadow-2xl opacity-0 group-hover/skill:opacity-100 pointer-events-none transition-all duration-200 translate-y-2 group-hover/skill:translate-y-0 z-[100] flex flex-col gap-1.5">
                                                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-b border-r border-slate-600 rotate-45"></div>
                                                        <div className="font-bold text-white text-xs text-center border-b border-slate-700 pb-1.5">{skill.name}</div>
                                                        <div className="text-[10px] text-gray-400 text-center leading-snug mb-1">{skill.description}</div>
                                                        <div className="flex justify-center flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono bg-black/50 py-1.5 px-2 rounded-lg border border-white/5">
                                                            {(() => {
                                                                const rules = GameRulesManager.get();
                                                                const hasWeaponScaling = skill.effects?.some(e => e.type === 'WEAPON_DAMAGE_REPLACEMENT' as any);
                                                                const weapon = activeEntity?.equipped?.mainHand;

                                                                let strBonus = 0;
                                                                if (skill.pushDistance && skill.pushDistance > 0) {
                                                                    strBonus = activeEntity ? Math.floor(activeEntity.strength * (rules.combat.shovePushDamageRatio || 0.1)) : 0;
                                                                } else if (hasWeaponScaling && weapon?.weaponType === 'ranged') {
                                                                    strBonus = 0;
                                                                } else {
                                                                    strBonus = activeEntity ? Math.floor(activeEntity.strength * 0.3) : 0;
                                                                }

                                                                let baseVal = skill.damage || 0;
                                                                if (hasWeaponScaling && weapon) {
                                                                    const weaponDmgEffect = weapon.effects?.find((e: any) =>
                                                                        e.target === 'damage' || e.target === 'physical_damage' || e.type === 'COMBAT_BONUS' as any
                                                                    );
                                                                    if (weaponDmgEffect) baseVal = weaponDmgEffect.value;
                                                                }

                                                                const total = hasWeaponScaling ? (baseVal + strBonus) : ((skill.damage || 0) + strBonus);
                                                                const isDistract = skill.id === 'distract';
                                                                const isAnalyze = skill.id === 'analyze';
                                                                const isStealth = skill.effects?.some(e => e.type === 'STEALTH' as any);
                                                                const isProtection = skill.effects?.some(e => e.type === 'PROTECTION_STANCE' as any);

                                                                if (isAnalyze) {
                                                                    const scale = rules.combat.analyzeIntelScale || 0.6;
                                                                    const base = rules.combat.analyzeBaseCrit || 30;
                                                                    const bonus = base + Math.floor(scale * Math.log((activeEntity?.intelligence || 0) + 1) * 10);
                                                                    return (
                                                                        <div className="flex flex-col gap-1 w-full text-indigo-300">
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="font-black uppercase">Crit Bonus</span>
                                                                                <span className="font-mono">+{bonus}%</span>
                                                                            </div>
                                                                            <div className="text-[8px] text-indigo-300/60 italic leading-snug">
                                                                                {base}% + floor({scale} × ln(Int {activeEntity?.intelligence}))
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }

                                                                if (isDistract) {
                                                                    const scale = rules.combat.distractCharismaScale || 0.42;
                                                                    const mpReduction = 1 + Math.floor(scale * Math.log((activeEntity?.charisma || 0) + 1));
                                                                    return (
                                                                        <div className="flex flex-col gap-1 w-full text-rose-300">
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="font-black uppercase">Stat Check</span>
                                                                                <span className="font-mono">Cha vs Wis</span>
                                                                            </div>
                                                                            <div className="flex items-center justify-between border-t border-rose-300/10 pt-1 mt-0.5">
                                                                                <span className="font-black uppercase">MP Loss</span>
                                                                                <span className="font-mono">-{mpReduction} MP</span>
                                                                            </div>
                                                                            <div className="text-[8px] text-rose-300/60 italic leading-snug">
                                                                                1 + floor({scale} × ln(Cha {activeEntity?.charisma}))
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }

                                                                if (isStealth) {
                                                                    const baseDur = rules.combat.stealthBaseDuration || 1;
                                                                    const factor = rules.combat.stealthScaleFactor || 1.4;
                                                                    const bonus = activeEntity ? Math.floor(factor * Math.log(activeEntity.wisdom + 1)) : 0;
                                                                    const totalDur = baseDur + bonus;
                                                                    return (
                                                                        <div className="flex flex-col gap-1 w-full">
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="text-indigo-400 font-black uppercase">Duration</span>
                                                                                <span className="text-white font-mono">{totalDur} turns</span>
                                                                            </div>
                                                                            <div className="text-[8px] text-gray-500 italic">
                                                                                Base {baseDur} + floor({factor} × ln(Wisdom {activeEntity?.wisdom}))
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }

                                                                if (isProtection) {
                                                                    return (
                                                                        <div className="flex flex-col gap-1 w-full">
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="text-blue-400 font-black uppercase">Protection</span>
                                                                                <span className="text-white font-mono">1 turn</span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }

                                                                if (hasWeaponScaling) {
                                                                    return (
                                                                        <div className="flex flex-col gap-1 w-full">
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="text-red-400 font-black uppercase">Damage</span>
                                                                                <span className="text-white font-mono">Weapon-based</span>
                                                                            </div>
                                                                            <div className="text-[8px] text-gray-500 italic leading-snug">
                                                                                Hover a target to see the Rust combat preview.
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }

                                                                if (skill.pushDistance) {
                                                                    return (
                                                                        <div className="flex flex-col gap-1 w-full">
                                                                            <div className="flex items-center justify-between text-[9px]">
                                                                                <span className="text-indigo-400 font-bold uppercase">Pushback</span>
                                                                                <span className="text-white font-mono">{skill.pushDistance} cells</span>
                                                                            </div>
                                                                            <div className="text-[8px] text-gray-500 italic leading-snug">
                                                                                Damage and shock are resolved by the Rust combat engine.
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }

                                                                if (skill.damage || strBonus > 0) {
                                                                    return (
                                                                        <div className="flex flex-col gap-1 w-full">
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className="text-red-400 font-black">{total} dmg</span>
                                                                                <span className="text-[8px] text-gray-500">
                                                                                    ({baseVal} + str {strBonus})
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }
                                                                return null;
                                                            })()}
                                                            {skill.healing && <span className="text-green-400 font-black">{skill.healing} heal</span>}
                                                            <span className="text-gray-400 font-bold border-l border-white/10 pl-2 ml-1">R: {skill.minRange}-{skill.maxRange}</span>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* End Turn Button */}
                                <button
                                    onClick={onEndTurn}
                                    disabled={!isPlayerTurn || phase !== 'combat'}
                                    className="h-[104px] px-6 bg-gradient-to-b from-orange-400 to-orange-600 hover:from-orange-300 hover:to-orange-500 border-2 border-orange-300 disabled:opacity-30 disabled:grayscale text-black font-black uppercase tracking-widest rounded-2xl text-sm transition-all shadow-[0_0_20px_rgba(249,115,22,0.2)] hover:shadow-[0_0_30px_rgba(249,115,22,0.5)] flex flex-col justify-center items-center gap-1 shrink-0 hover:scale-105"
                                >
                                    <span>End Turn</span>
                                    <span className="text-lg">⏭</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {(!isPlayerTurn || phase !== 'combat') && activeEntity && (
                        <div className="w-full flex-1 flex flex-col items-center justify-center gap-3 text-center opacity-70">
                            {phase === 'combat' && (
                                <>
                                    <div className={`w-6 h-6 rounded-full animate-ping ${activeEntity.isPlayer ? 'bg-blue-500' : 'bg-red-500'}`} />
                                    <span className="text-sm font-bold tracking-widest uppercase text-gray-400">{activeEntity.name}'s Turn</span>
                                </>
                            )}
                            {phase === 'victory' && <span className="text-4xl font-black text-yellow-500 drop-shadow-[0_0_20px_rgba(234,179,8,0.5)] tracking-widest">🏆 VICTORY</span>}
                            {phase === 'defeat' && <span className="text-4xl font-black text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.5)] tracking-widest">💀 DEFEAT</span>}
                        </div>
                    )}
                </div>

                {/* Combat Log */}
                <div className="w-[320px] shrink-0 p-3 bg-black/80 flex flex-col overflow-hidden font-mono text-xs border-l border-white/10">
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
    isAoe?: boolean;
    hasBattlemap?: boolean;
    onClick: () => void;
    onHover?: () => void;
    onLeave?: () => void;
    errorMessage?: string;
    damagePreview?: DamagePreview | null;
}

function IsometricTile({ cell, x, y, entity, isActive, isAoe, hasBattlemap, onClick, onHover, onLeave, errorMessage, damagePreview }: IsometricTileProps) {
    const isDead = entity && entity.hp <= 0;
    const [isHovered, setIsHovered] = useState(false);

    const handleHover = () => {
        setIsHovered(true);
        if (onHover) onHover();
    };

    const handleLeave = () => {
        setIsHovered(false);
        if (onLeave) onLeave();
    };

    const halfW = TILE_WIDTH / 2;
    const halfH = TILE_HEIGHT / 2;
    const diamondPath = `M ${halfW} 0 L ${TILE_WIDTH} ${halfH} L ${halfW} ${TILE_HEIGHT} L 0 ${halfH} Z`;

    let fillColor = hasBattlemap ? 'transparent' : 'rgba(30, 40, 55, 0.6)';
    let strokeColor = 'rgba(255,255,255,0.05)';
    let strokeWidth = 1;

    if (cell.highlight === 'move') {
        fillColor = 'rgba(45, 212, 191, 0.4)';
        strokeColor = 'rgba(255,255,255,0.7)';
        strokeWidth = 2;
    }
    if (cell.highlight === 'attack') {
        fillColor = 'rgba(244, 63, 94, 0.45)';
        strokeColor = 'rgba(255,255,255,0.4)';
    }
    if (cell.highlight === 'attack-blocked') {
        fillColor = 'rgba(244, 63, 94, 0.15)';
        strokeColor = 'rgba(255,255,255,0.05)';
    }
    if (cell.highlight === 'path') {
        fillColor = 'rgba(45, 212, 191, 0.6)';
    }
    if (isAoe) {
        fillColor = 'rgba(251, 146, 60, 0.35)'; // Keep standard AoE color overlay
        // Make the stroke slightly harder to stand out in the AoE blast
        if (cell.highlight !== 'attack-blocked') {
            strokeColor = 'rgba(255,200,100,0.6)';
        }
    }

    const showAnalyzed = entity?.activeEffects?.some(e => e.type === 'ANALYZED' as any);

    return (
        <div
            className="absolute transition-all duration-200"
            style={{
                left: x,
                top: y,
                width: TILE_WIDTH,
                height: TILE_HEIGHT,
                zIndex: cell.row + cell.col,
            }}
            onClick={onClick}
            onMouseEnter={handleHover}
            onMouseLeave={handleLeave}
        >
            <svg width={TILE_WIDTH} height={TILE_HEIGHT} className="overflow-visible pointer-events-none">
                <path
                    d={diamondPath}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                />
            </svg>

            {/* Error Message on Hover */}
            {isHovered && errorMessage && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-red-600/90 text-white text-[9px] px-2 py-1 rounded shadow-xl whitespace-nowrap z-50 animate-bounce">
                    ⚠️ {errorMessage}
                </div>
            )}

            {/* Damage Preview Badge */}
            {(isHovered || isAoe) && damagePreview && !isDead && (
                <div className="absolute -top-20 left-1/2 -translate-x-1/2 bg-black/90 border border-red-500/50 p-1.5 rounded shadow-xl z-50 min-w-[90px] pointer-events-none">
                    <div className="text-[8px] uppercase font-black text-red-500/70 mb-0.5 tracking-tighter">Est. Impact</div>
                    <div className="flex flex-col gap-0.5">
                        <div className="flex justify-between items-center text-[10px]">
                            <span className="text-gray-400">Hits</span>
                            <span className="font-mono font-bold text-white">{damagePreview.min}-{damagePreview.max}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                            <span className="text-amber-400">CRIT</span>
                            <span className="font-mono font-bold text-amber-400">{damagePreview.critMin}-{damagePreview.critMax}</span>
                        </div>
                        <div className="mt-1 border-t border-white/10 pt-0.5 flex justify-between items-center text-[7px] text-gray-500 uppercase">
                            <span>Chance</span>
                            <span>{Math.round(damagePreview.critChance * 100)}%</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Standalone Sprites for Obstacles */}
            {cell.textureUrl && !cell.walkable && (
                <img
                    src={cell.textureUrl}
                    alt="obstacle"
                    className="absolute bottom-0 left-0 w-full object-contain pointer-events-none drop-shadow-lg transition-all duration-150"
                    style={{ height: TILE_WIDTH, zIndex: 1 }}
                />
            )}

            {!cell.walkable && !cell.textureUrl && (
                <svg width={TILE_WIDTH} height={TILE_HEIGHT + 16} className="absolute pointer-events-none" style={{ top: -16, zIndex: 2 }}>
                    {/* Top Face */}
                    <path d={`M ${halfW} 0 L ${TILE_WIDTH} ${halfH} L ${halfW} ${TILE_HEIGHT} L 0 ${halfH} Z`}
                        fill="#191e28" stroke="rgba(255,255,255,0.15)" strokeWidth={1}
                    />
                    {/* Left Face */}
                    <path d={`M 0 ${halfH} L ${halfW} ${TILE_HEIGHT} L ${halfW} ${TILE_HEIGHT + 16} L 0 ${halfH + 16} Z`}
                        fill="#0f141c" stroke="rgba(255,255,255,0.05)" strokeWidth={0.5}
                    />
                    {/* Right Face */}
                    <path d={`M ${TILE_WIDTH} ${halfH} L ${halfW} ${TILE_HEIGHT} L ${halfW} ${TILE_HEIGHT + 16} L ${TILE_WIDTH} ${halfH + 16} Z`}
                        fill="#141923" stroke="rgba(255,255,255,0.05)" strokeWidth={0.5}
                    />
                </svg>
            )}


        </div>
    );
}

// ═══════════════════════════════════════════════════════════
// TacticalEntityView — Animated character sprite
// ═══════════════════════════════════════════════════════════

interface TacticalEntityViewProps {
    entity: TacticalEntity;
    grid: Grid;
    isActive: boolean;
}

function TacticalEntityView({ entity, grid, isActive }: TacticalEntityViewProps) {
    const [visualPos, setVisualPos] = useState({ row: entity.gridPos.row, col: entity.gridPos.col });
    const lastPosRef = useRef(entity.gridPos);

    useEffect(() => {
        if (entity.gridPos.row !== lastPosRef.current.row || entity.gridPos.col !== lastPosRef.current.col) {
            // Position changed! Perform path-based animation
            const from = lastPosRef.current;
            const to = entity.gridPos;
            lastPosRef.current = to;

            const path = findPath(grid, from.row, from.col, to.row, to.col);
            if (path && path.length > 0) {
                animatePath(path);
            } else {
                setVisualPos(to);
            }
        }
    }, [entity.gridPos, grid]);

    const animatePath = async (path: GridCell[]) => {
        for (const step of path) {
            setVisualPos({ row: step.row, col: step.col });
            await new Promise(resolve => setTimeout(resolve, 200)); // 200ms per cell
        }
    };

    const { x, y } = gridToScreen(visualPos.row, visualPos.col);
    const isDead = entity.hp <= 0;

    if (isDead) return null;

    return (
        <div
            className={`
                absolute flex items-center justify-center pointer-events-none 
                transition-all duration-200 ease-linear
                ${entity.activeEffects?.some((e: any) => e.type === 'STEALTH' as any) ? 'opacity-30 grayscale-[50%] blur-[0.5px]' : 'opacity-100'}
            `}
            style={{
                left: x,
                top: y - 12,
                width: TILE_WIDTH,
                height: TILE_HEIGHT,
                zIndex: visualPos.row + visualPos.col + 100, // High z-index to stay above tiles
            }}
        >
            <div className="absolute -top-5 flex gap-1 z-10">
                {entity.activeEffects?.some((e: any) => e.type === 'PROTECTION_STANCE' as any) && (
                    <span className="text-[10px] drop-shadow-[0_0_5px_rgba(255,255,255,0.8)] animate-pulse">🛡️</span>
                )}
                {entity.activeEffects?.some((e: any) => e.type === 'STEALTH' as any) && (
                    <span className="text-[10px] drop-shadow-[0_0_5px_rgba(99,102,241,0.8)] animate-bounce">👤</span>
                )}
                {entity.activeEffects?.some((e: any) => e.type === 'ANALYZED' as any) && (
                    <span className="text-[10px] drop-shadow-[0_0_5px_rgba(234,179,8,0.8)] animate-[pulse_1s_infinite]">🔍</span>
                )}
            </div>

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
    );
}
