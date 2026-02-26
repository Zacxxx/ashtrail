import React from "react";
import { Item } from "@ashtrail/core";

interface ItemsViewProps {
    item: Item | null;
}

export function ItemsView({ item }: ItemsViewProps) {
    if (!item) {
        return (
            <div className="w-full h-full flex items-center justify-center text-gray-500 font-mono text-sm">
                Select an item to view details.
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col gap-6 p-8 bg-black/40 border border-white/5 rounded-2xl relative">
            <div className="flex justify-between items-start border-b border-white/10 pb-6">
                <div className="flex flex-col gap-2">
                    <h2 className="text-3xl font-black uppercase tracking-widest text-yellow-500">
                        {item.name}
                    </h2>
                    <div className="flex items-center gap-3 text-sm font-mono text-gray-400">
                        <span className="bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded border border-yellow-500/20 uppercase text-xs font-bold">
                            {item.category}
                        </span>
                        <span>•</span>
                        <span>Cost: {item.cost}</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar space-y-8">
                {/* Description */}
                <div className="space-y-3">
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/10 pb-1">Description</h3>
                    <p className="text-sm text-gray-300 leading-relaxed italic border-l-2 border-yellow-500/30 pl-4 py-2 bg-white/5 rounded-r-lg">
                        {item.description}
                    </p>
                </div>

                {/* Mechanical Effects */}
                <div className="space-y-3">
                    <h3 className="text-[10px] font-black text-yellow-500/70 uppercase tracking-widest border-b border-yellow-900/30 pb-1">Mechanical Effects</h3>
                    {item.effects && item.effects.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {item.effects.map((effect, idx) => (
                                <div key={idx} className="bg-white/5 p-3 rounded-lg border border-white/5 flex flex-col gap-1">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold uppercase tracking-wide text-yellow-400">{effect.type.replace('_', ' ')}</span>
                                        <span className="text-xs font-mono font-bold text-white bg-black/50 px-2 py-0.5 rounded">
                                            {effect.value > 0 ? `+${effect.value}` : effect.value}
                                        </span>
                                    </div>
                                    {effect.target && (
                                        <span className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">TARGET: {effect.target}</span>
                                    )}
                                    {effect.trigger && (
                                        <span className="text-[10px] text-teal-500/70 font-mono tracking-widest uppercase">TRIGGER: {effect.trigger}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-500 italic">This item has no direct mechanical effects.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
