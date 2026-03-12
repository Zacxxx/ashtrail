import React, { useMemo } from "react";
import { GameRegistry, Occupation, Trait, validateGameplayContent } from "@ashtrail/core";

export function GameplayValidationPanel({ traits, occupations }: { traits: Trait[]; occupations: Occupation[] }) {
    const report = useMemo(
        () => validateGameplayContent(traits, occupations, GameRegistry.getAllTalentTrees()),
        [traits, occupations],
    );

    return (
        <div className="bg-[#1e1e1e]/60 border border-white/5 rounded-2xl shadow-lg backdrop-blur-md p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <h2 className="text-sm font-black tracking-widest text-white uppercase">Gameplay Validation</h2>
                <div className="flex items-center gap-2 text-[9px] font-mono uppercase">
                    <span className={`px-2 py-1 rounded border ${report.summary.errorCount > 0 ? 'text-red-400 border-red-500/30 bg-red-500/10' : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'}`}>
                        {report.summary.errorCount} errors
                    </span>
                    <span className="px-2 py-1 rounded border border-yellow-500/30 bg-yellow-500/10 text-yellow-300">
                        {report.summary.warningCount} warnings
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-[10px] font-mono uppercase">
                <div className="bg-black/30 border border-white/5 rounded-xl p-3 text-center">
                    <div className="text-gray-500">Traits</div>
                    <div className="text-orange-400 font-black text-lg">{report.summary.traitCount}</div>
                </div>
                <div className="bg-black/30 border border-white/5 rounded-xl p-3 text-center">
                    <div className="text-gray-500">Occupations</div>
                    <div className="text-teal-400 font-black text-lg">{report.summary.occupationCount}</div>
                </div>
                <div className="bg-black/30 border border-white/5 rounded-xl p-3 text-center">
                    <div className="text-gray-500">Trees</div>
                    <div className="text-cyan-400 font-black text-lg">{report.summary.treeCount}</div>
                </div>
            </div>

            <div className="space-y-2 max-h-[240px] overflow-y-auto custom-scrollbar pr-1">
                {report.issues.length === 0 ? (
                    <div className="text-[10px] font-mono uppercase text-emerald-400 border border-emerald-500/20 bg-emerald-500/5 rounded-xl p-3">
                        Content coverage is clean. All traits, occupations, and trees have gameplay payloads.
                    </div>
                ) : (
                    report.issues.map((issue) => (
                        <div
                            key={`${issue.category}-${issue.id}-${issue.message}`}
                            className={`rounded-xl border p-3 text-[10px] ${issue.level === 'error'
                                ? 'border-red-500/20 bg-red-500/5 text-red-300'
                                : 'border-yellow-500/20 bg-yellow-500/5 text-yellow-200'
                                }`}
                        >
                            <div className="font-black uppercase tracking-widest">{issue.category} / {issue.id}</div>
                            <div className="text-gray-400 mt-1">{issue.message}</div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
