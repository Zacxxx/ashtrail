import React, { useState } from "react";
import { GameplayEffect, EffectType } from "@ashtrail/core";

interface ModifierEditorProps {
    effects: GameplayEffect[];
    onChange: (effects: GameplayEffect[]) => void;
    colorScheme?: 'orange' | 'teal' | 'yellow' | 'indigo';
}

const EFFECT_TYPES: EffectType[] = [
    'STAT_MODIFIER',
    'COMBAT_BONUS',
    'RESOURCE_MODIFIER',
    'EXPLORATION_BONUS',
    'DAMAGE_OVER_TIME',
    'HEAL_OVER_TIME',
    'STATUS_IMMUNITY',
    'ACTION_MODIFIER',
    'WEAPON_DAMAGE_REPLACEMENT',
    'LORE_EFFECT'
];

const COMMON_TARGETS = [
    'strength', 'agility', 'intelligence', 'wisdom', 'endurance', 'charisma',
    'maxHp', 'hp', 'maxAp', 'ap', 'maxMp', 'mp',
    'evasion', 'defense', 'critChance', 'resistance',
    'fire_damage', 'poison_damage', 'physical_damage', 'damage',
    'mainHand', 'offHand',
    'food', 'water', 'fuel', 'parts'
];

const TRIGGERS = [
    'passive', 'on_hit', 'on_turn_start', 'on_turn_end', 'on_defend', 'on_kill'
];

export function ModifierEditor({ effects, onChange, colorScheme = 'orange' }: ModifierEditorProps) {
    const [isAdding, setIsAdding] = useState(false);

    const colors = {
        orange: 'text-orange-400 border-orange-500/30 bg-orange-500/10 hover:border-orange-500/50',
        teal: 'text-teal-400 border-teal-500/30 bg-teal-500/10 hover:border-teal-500/50',
        yellow: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10 hover:border-yellow-500/50',
        indigo: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10 hover:border-indigo-500/50',
    };

    const addEffect = () => {
        const newEffect: GameplayEffect = {
            id: `effect-${Date.now()}`,
            name: "New Effect",
            description: "",
            type: 'STAT_MODIFIER',
            target: 'strength',
            value: 0,
            trigger: 'passive'
        };
        onChange([...effects, newEffect]);
    };

    const updateEffect = (index: number, patch: Partial<GameplayEffect>) => {
        const next = [...effects];
        next[index] = { ...next[index], ...patch };
        onChange(next);
    };

    const removeEffect = (index: number) => {
        onChange(effects.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500">Gameplay Modifiers</h3>
                <button
                    onClick={addEffect}
                    className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${colors[colorScheme]}`}
                >
                    + Add Modifier
                </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {effects.map((eff, i) => (
                    <div key={eff.id || i} className="bg-black/40 border border-white/5 rounded-xl p-4 space-y-3 relative group">
                        <button
                            onClick={() => removeEffect(i)}
                            className="absolute top-3 right-3 text-gray-600 hover:text-red-400 transition-colors text-xs"
                        >
                            ✕
                        </button>

                        <div className="grid grid-cols-12 gap-3">
                            {/* Header Row */}
                            <div className="col-span-8 flex flex-col gap-1">
                                <input
                                    value={eff.name}
                                    onChange={e => updateEffect(i, { name: e.target.value })}
                                    placeholder="Effect Name..."
                                    className="bg-transparent border-none p-0 text-xs font-bold text-white uppercase tracking-wider focus:ring-0 w-full"
                                />
                                <input
                                    value={eff.description}
                                    onChange={e => updateEffect(i, { description: e.target.value })}
                                    placeholder="Brief description of the mechanic..."
                                    className="bg-transparent border-none p-0 text-[10px] text-gray-500 focus:ring-0 w-full"
                                />
                            </div>
                            <div className="col-span-4 flex justify-end items-start gap-2">
                                <select
                                    value={eff.type}
                                    onChange={e => updateEffect(i, { type: e.target.value as EffectType })}
                                    className="bg-black/60 border border-white/10 rounded px-2 py-1 text-[9px] font-mono text-gray-400 outline-none focus:border-white/20"
                                >
                                    {EFFECT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4 pt-2 border-t border-white/5">
                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-gray-600 uppercase">Target</label>
                                <div className="relative">
                                    <input
                                        list={`targets-${i}`}
                                        value={eff.target}
                                        onChange={e => updateEffect(i, { target: e.target.value })}
                                        className="w-full bg-black/60 border border-white/10 rounded px-2 py-1.5 text-[10px] text-white font-mono outline-none"
                                    />
                                    <datalist id={`targets-${i}`}>
                                        {COMMON_TARGETS.map(t => <option key={t} value={t} />)}
                                    </datalist>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-gray-600 uppercase">Value</label>
                                <div className="flex items-center gap-1.5">
                                    <input
                                        type="number"
                                        value={eff.value}
                                        onChange={e => updateEffect(i, { value: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-black/60 border border-white/10 rounded px-2 py-1.5 text-[10px] text-white font-mono outline-none"
                                    />
                                    <button
                                        onClick={() => updateEffect(i, { isPercentage: !eff.isPercentage })}
                                        className={`px-1.5 py-1.5 rounded border text-[9px] font-bold transition-all ${eff.isPercentage ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'bg-black/60 border-white/10 text-gray-500'}`}
                                    >
                                        %
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-gray-600 uppercase">Duration</label>
                                <input
                                    type="number"
                                    value={eff.duration || 0}
                                    onChange={e => updateEffect(i, { duration: parseInt(e.target.value) || 0 })}
                                    placeholder="∞"
                                    className="w-full bg-black/60 border border-white/10 rounded px-2 py-1.5 text-[10px] text-white font-mono outline-none"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-gray-600 uppercase">Trigger</label>
                                <select
                                    value={eff.trigger}
                                    onChange={e => updateEffect(i, { trigger: e.target.value as any })}
                                    className="w-full bg-black/60 border border-white/10 rounded px-2 py-1.5 text-[10px] text-white font-mono outline-none"
                                >
                                    {TRIGGERS.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {effects.length === 0 && (
                <div className="py-8 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center text-gray-600">
                    <p className="text-[10px] font-black uppercase tracking-widest italic">No modifiers active</p>
                </div>
            )}
        </div>
    );
}
