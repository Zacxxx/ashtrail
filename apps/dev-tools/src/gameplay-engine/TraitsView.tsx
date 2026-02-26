import React from "react";
import { Trait } from "@ashtrail/core";

interface TraitsViewProps {
    trait: Trait | null;
}

export function TraitsView({ trait }: TraitsViewProps) {
    if (!trait) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                <span className="text-4xl mb-4 opacity-20">🧬</span>
                <p className="font-mono text-sm tracking-widest uppercase">Select a Trait to view details</p>
            </div>
        );
    }

    const typeColors = {
        positive: "text-blue-400 border-blue-500/30 bg-blue-500/10",
        negative: "text-red-400 border-red-500/30 bg-red-500/10",
        neutral: "text-gray-300 border-gray-500/30 bg-gray-500/10",
    };

    return (
        <div className="w-full h-full max-w-[800px] flex flex-col gap-8 p-8 border border-white/5 rounded-2xl bg-black/40 backdrop-blur-sm shadow-2xl overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-start border-b border-white/10 pb-6">
                <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase font-black tracking-[0.3em] text-orange-500">Trait Data</span>
                    <h2 className={`text-4xl font-black uppercase tracking-wider ${typeColors[trait.type].split(' ')[0]}`}>
                        {trait.name}
                    </h2>
                    <span className="text-xs text-gray-500 font-mono">{trait.id}</span>
                </div>

                <div className="flex flex-col gap-2 items-end">
                    <div className={`px-4 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest ${typeColors[trait.type]}`}>
                        {trait.type}
                    </div>
                    <div className="px-4 py-1 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-400 text-[10px] font-bold uppercase tracking-widest">
                        Cost: {trait.cost}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                <div className="flex flex-col gap-2 p-6 bg-white/5 rounded-xl border border-white/5">
                    <h3 className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Description</h3>
                    <p className="text-sm text-gray-300 leading-relaxed font-mono">
                        {trait.description}
                    </p>
                </div>

                {trait.effects && trait.effects.length > 0 && (
                    <div className="flex flex-col gap-2 p-6 bg-orange-500/5 rounded-xl border border-orange-500/20">
                        <h3 className="text-[10px] uppercase font-bold text-orange-500/70 tracking-widest mb-1">Mechanical Effects</h3>
                        <div className="flex flex-col gap-2">
                            {trait.effects.map((eff, i) => (
                                <div key={i} className="flex justify-between items-center text-xs font-mono bg-black/40 p-2 rounded border border-white/5">
                                    <span className="text-gray-400 capitalize">{eff.type.replace('_', ' ')}</span>
                                    <span className="text-orange-400 font-bold">{eff.target}</span>
                                    <span className={`${eff.value > 0 ? 'text-green-400' : 'text-red-400'} font-black px-2 bg-white/5 rounded`}>
                                        {eff.value > 0 ? '+' : ''}{eff.value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {trait.impact && !trait.effects && (
                    <div className="flex flex-col gap-2 p-6 bg-white/5 rounded-xl border border-white/10">
                        <h3 className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Legacy Impact Note</h3>
                        <p className="text-xs text-gray-400 leading-relaxed font-mono italic">
                            {trait.impact}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
