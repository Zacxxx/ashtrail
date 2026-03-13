import React, { useEffect, useMemo, useState } from "react";
import { GameRegistry, Occupation, OccupationCategory, TalentNode, TalentTree, Trait } from "@ashtrail/core";
import { IconGallerySelector } from "../components/IconGallerySelector";

interface OccupationsViewProps {
    occupation: Occupation | null;
    onSave?: () => void;
    onOpenTrait?: (traitId: string) => void;
}

function cloneTree(tree?: TalentTree | null): TalentTree | null {
    return tree ? JSON.parse(JSON.stringify(tree)) : null;
}

function linkedTraits(traitIds: string[]): Trait[] {
    return traitIds
        .map((traitId) => GameRegistry.getTrait(traitId))
        .filter((trait): trait is Trait => Boolean(trait));
}

function TraitLinkManager({
    title,
    tone,
    traitIds,
    onLink,
    onUnlink,
    onOpenTrait,
}: {
    title: string;
    tone: "teal" | "cyan";
    traitIds: string[];
    onLink: (traitId: string) => void;
    onUnlink: (traitId: string) => void;
    onOpenTrait?: (traitId: string) => void;
}) {
    const [selectedTraitId, setSelectedTraitId] = useState("");
    const allTraits = GameRegistry.getAllTraits();
    const linked = linkedTraits(traitIds);
    const toneClasses = tone === "teal"
        ? "border-teal-500/20 bg-teal-500/10 text-teal-300"
        : "border-cyan-500/20 bg-cyan-500/10 text-cyan-300";

    useEffect(() => {
        if (selectedTraitId && traitIds.includes(selectedTraitId)) {
            setSelectedTraitId("");
        }
    }, [selectedTraitId, traitIds]);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-white">{title}</h3>
                <span className="text-[9px] font-mono text-gray-500">{traitIds.length} linked</span>
            </div>

            <div className="flex gap-2">
                <select
                    value={selectedTraitId}
                    onChange={(e) => setSelectedTraitId(e.target.value)}
                    className="flex-1 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white outline-none transition-all"
                >
                    <option value="">Select a trait...</option>
                    {allTraits
                        .filter((trait) => !traitIds.includes(trait.id))
                        .map((trait) => (
                            <option key={trait.id} value={trait.id}>{trait.name}</option>
                        ))}
                </select>
                <button
                    onClick={() => {
                        if (!selectedTraitId) return;
                        onLink(selectedTraitId);
                        setSelectedTraitId("");
                    }}
                    disabled={!selectedTraitId}
                    className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest disabled:opacity-30 ${toneClasses}`}
                >
                    Link
                </button>
            </div>

            {linked.length > 0 ? (
                <div className="grid grid-cols-1 gap-2">
                    {linked.map((trait) => (
                        <div key={trait.id} className="rounded-xl border border-white/5 bg-black/30 px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-white">{trait.name}</div>
                                    <div className="mt-1 text-[9px] font-mono text-gray-500">{trait.id}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {onOpenTrait && (
                                        <button
                                            onClick={() => onOpenTrait(trait.id)}
                                            className="text-[9px] font-black uppercase text-cyan-300 hover:text-cyan-200"
                                        >
                                            Open
                                        </button>
                                    )}
                                    <button
                                        onClick={() => onUnlink(trait.id)}
                                        className="text-[9px] font-black uppercase text-red-400 hover:text-red-300"
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 text-[10px] leading-snug text-gray-500">{trait.description}</div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="rounded-xl border border-dashed border-white/5 bg-black/20 p-4 text-[10px] font-mono uppercase text-gray-500">
                    No linked traits yet.
                </div>
            )}
        </div>
    );
}

function TraitPayloadPreview({
    traits,
    emptyLabel,
}: {
    traits: Trait[];
    emptyLabel: string;
}) {
    const allSkills = GameRegistry.getAllSkills();

    if (traits.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-white/5 bg-black/20 p-4 text-[10px] font-mono uppercase text-gray-500">
                {emptyLabel}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-2">
            {traits.map((trait) => (
                <div key={`${trait.id}-payload`} className="rounded-xl border border-white/5 bg-black/40 p-3 text-[10px] font-mono">
                    <div className="text-white uppercase font-black tracking-widest">{trait.name}</div>
                    <div className="mt-1 text-gray-500">{trait.id}</div>
                    {trait.effects && trait.effects.length > 0 && (
                        <div className="mt-3 space-y-1">
                            {trait.effects.map((effect, index) => (
                                <div key={`${trait.id}-effect-${index}`} className="rounded-lg border border-white/5 bg-black/20 px-2 py-1">
                                    {effect.name || effect.target || effect.type}
                                    <span className="ml-2 text-gray-500">
                                        {effect.scope || "global"} • {effect.isPercentage ? `${effect.value}%` : effect.value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    {trait.grantsSkillIds && trait.grantsSkillIds.length > 0 && (
                        <div className="mt-3 space-y-1">
                            {trait.grantsSkillIds.map((skillId) => (
                                <div key={`${trait.id}-skill-${skillId}`} className="rounded-lg border border-cyan-900/20 bg-cyan-500/5 px-2 py-1 text-cyan-200">
                                    Granted skill: {allSkills.find((skill) => skill.id === skillId)?.name || skillId}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

export function OccupationsView({ occupation, onSave, onOpenTrait }: OccupationsViewProps) {
    const [id, setId] = useState("");
    const [name, setName] = useState("");
    const [category, setCategory] = useState<OccupationCategory>("FIELD");
    const [description, setDescription] = useState("");
    const [shortDescription, setShortDescription] = useState("");
    const [grantsTraitIds, setGrantsTraitIds] = useState<string[]>([]);
    const [icon, setIcon] = useState("⚙️");
    const [talentTree, setTalentTree] = useState<TalentTree | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);

    useEffect(() => {
        if (!occupation) return;
        const registryTree = cloneTree(GameRegistry.getTalentTree(occupation.id));
        setId(occupation.id);
        setName(occupation.name);
        setCategory(occupation.category);
        setDescription(occupation.description);
        setShortDescription(occupation.shortDescription);
        setGrantsTraitIds(occupation.grantsTraitIds || []);
        setIcon(occupation.icon || "⚙️");
        setTalentTree(registryTree);
        setSelectedNodeId(registryTree?.nodes[0]?.id || null);
    }, [occupation]);

    const baseTraits = useMemo(() => linkedTraits(grantsTraitIds), [grantsTraitIds]);
    const selectedNode = useMemo(
        () => talentTree?.nodes.find((node) => node.id === selectedNodeId) || null,
        [talentTree, selectedNodeId],
    );
    const selectedNodeTraits = useMemo(
        () => linkedTraits(selectedNode?.grantsTraitIds || []),
        [selectedNode?.grantsTraitIds],
    );

    const updateSelectedNode = (patch: Partial<TalentNode>) => {
        if (!selectedNodeId) return;
        setTalentTree((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                nodes: prev.nodes.map((node) => node.id === selectedNodeId ? { ...node, ...patch } : node),
            };
        });
    };

    const toggleDependency = (dependencyId: string) => {
        if (!selectedNode || !talentTree) return;
        const currentDependencies = new Set(selectedNode.dependencies || []);
        if (currentDependencies.has(dependencyId)) currentDependencies.delete(dependencyId);
        else currentDependencies.add(dependencyId);
        updateSelectedNode({ dependencies: Array.from(currentDependencies) });
    };

    const addNode = () => {
        setTalentTree((prev) => {
            const baseTree = prev || { occupationId: id, nodes: [] };
            const nextIndex = baseTree.nodes.length + 1;
            const maxY = baseTree.nodes.reduce((highest, node) => Math.max(highest, node.pos?.y || 0), -420);
            const nextNode: TalentNode = {
                id: `node-${nextIndex}`,
                name: `New Talent ${nextIndex}`,
                description: "Describe this unlock.",
                pos: { x: 0, y: maxY + 120 },
                type: "passive",
                cost: 1,
                grantsTraitIds: [],
            };
            setSelectedNodeId(nextNode.id);
            return {
                ...baseTree,
                occupationId: id,
                nodes: [...baseTree.nodes, nextNode],
            };
        });
    };

    const deleteSelectedNode = () => {
        if (!selectedNodeId) return;
        setTalentTree((prev) => {
            if (!prev) return prev;
            const remainingNodes = prev.nodes.filter((node) => node.id !== selectedNodeId);
            setSelectedNodeId(remainingNodes[0]?.id || null);
            return {
                ...prev,
                nodes: remainingNodes.map((node) => ({
                    ...node,
                    dependencies: (node.dependencies || []).filter((dependencyId) => dependencyId !== selectedNodeId),
                })),
            };
        });
    };

    const handleSave = async () => {
        const occupationPayload: Occupation = {
            id,
            name,
            category,
            description,
            shortDescription,
            grantsTraitIds,
            perks: occupation?.perks || [],
            icon,
        };
        const treePayload: TalentTree | null = talentTree
            ? { ...talentTree, occupationId: id }
            : null;

        try {
            const occupationRes = await fetch("http://127.0.0.1:8787/api/data/occupations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(occupationPayload),
            });
            if (!occupationRes.ok) return;

            if (treePayload) {
                const treeRes = await fetch("http://127.0.0.1:8787/api/data/talent-trees", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(treePayload),
                });
                if (!treeRes.ok) return;
            }

            await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
            if (onSave) onSave();
        } catch (e) {
            console.error(e);
        }
    };

    if (!occupation) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                <span className="text-4xl mb-4 opacity-20">⚙️</span>
                <p className="font-mono text-sm tracking-widest uppercase">Select an Occupation to edit</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full max-w-[1100px] bg-[#1e1e1e]/60 rounded-2xl border border-white/5 shadow-2xl p-8 overflow-y-auto custom-scrollbar space-y-6">
            <IconGallerySelector
                isOpen={isGalleryOpen}
                onClose={() => setIsGalleryOpen(false)}
                onSelect={(url) => {
                    setIcon(url);
                    setIsGalleryOpen(false);
                }}
            />

            <div className="flex justify-between items-center">
                <h2 className="text-xl font-black tracking-widest text-teal-400 uppercase">Occupation Editor</h2>
                <div className="flex items-center gap-4">
                    <button
                        onClick={async () => {
                            if (window.confirm(`Delete occupation ${name}?`)) {
                                try {
                                    const res = await fetch(`http://127.0.0.1:8787/api/data/occupations/${id}`, { method: "DELETE" });
                                    if (res.ok) {
                                        await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
                                        if (onSave) onSave();
                                    }
                                } catch (e) { console.error(e); }
                            }
                        }}
                        className="px-3 py-1 bg-red-950/30 hover:bg-red-900/50 text-red-500 border border-red-900/30 text-[10px] font-bold uppercase rounded transition-all"
                    >
                        Delete
                    </button>
                    <span className="text-[10px] font-mono text-gray-500">{id}</span>
                </div>
            </div>

            <div className="grid grid-cols-6 gap-4">
                <div className="col-span-1 space-y-1">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Icon</label>
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={() => setIsGalleryOpen(true)}
                            className="w-full aspect-square bg-black/50 border border-white/10 rounded-xl flex items-center justify-center relative group hover:border-teal-500/30 transition-all overflow-hidden"
                        >
                            {icon.startsWith("/api/icons/") ? (
                                <img src={icon} alt="Icon" className="w-full h-full rounded object-cover p-2" />
                            ) : (
                                <span className="text-2xl">{icon}</span>
                            )}
                            <div className="absolute inset-0 bg-teal-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-[8px] font-black uppercase text-white bg-black/60 px-2 py-1 rounded">Change</span>
                            </div>
                        </button>
                    </div>
                </div>

                <div className="col-span-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Name</label>
                            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-teal-500/50 transition-all" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Category</label>
                            <select value={category} onChange={e => setCategory(e.target.value as OccupationCategory)} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-teal-500/50 transition-all">
                                <option value="SECURITY">Security</option>
                                <option value="TECHNICAL">Technical</option>
                                <option value="CRAFT">Craft</option>
                                <option value="ADMIN">Admin</option>
                                <option value="SOCIAL">Social</option>
                                <option value="FIELD">Field</option>
                            </select>
                        </div>
                    </div>

                    {!icon.startsWith("/api/icons/") && (
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Emoji Icon</label>
                            <input value={icon} onChange={e => setIcon(e.target.value)} className="w-full bg-transparent text-gray-400 border-none px-0 py-0 text-xs focus:ring-0" />
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Short Description</label>
                <input value={shortDescription} onChange={e => setShortDescription(e.target.value)} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-teal-500/50 transition-all" />
            </div>

            <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Full Description</label>
                <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={4}
                    className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-teal-500/50 transition-all resize-none shadow-inner"
                />
            </div>

            <div className="space-y-4 border-t border-white/10 pt-6">
                <TraitLinkManager
                    title="Base Occupation Traits"
                    tone="teal"
                    traitIds={grantsTraitIds}
                    onLink={(traitId) => setGrantsTraitIds((prev) => [...prev, traitId])}
                    onUnlink={(traitId) => setGrantsTraitIds((prev) => prev.filter((idToKeep) => idToKeep !== traitId))}
                    onOpenTrait={onOpenTrait}
                />
                <div className="space-y-2">
                    <h3 className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Resolved Baseline Preview</h3>
                    <TraitPayloadPreview traits={baseTraits} emptyLabel="No baseline occupation traits linked yet." />
                </div>
            </div>

            <div className="space-y-4 border-t border-white/10 pt-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Talent Tree Editor</h3>
                        <div className="mt-1 text-[9px] font-mono text-gray-500">{talentTree?.nodes.length || 0} nodes</div>
                    </div>
                    <div className="flex items-center gap-2">
                        {!talentTree && (
                            <button
                                onClick={() => setTalentTree({ occupationId: id, nodes: [] })}
                                className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-300"
                            >
                                Create Tree
                            </button>
                        )}
                        <button
                            onClick={addNode}
                            className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-300"
                        >
                            Add Node
                        </button>
                    </div>
                </div>

                {talentTree ? (
                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-1 space-y-2 max-h-[520px] overflow-y-auto custom-scrollbar pr-1">
                            {talentTree.nodes.map((node) => (
                                <button
                                    key={node.id}
                                    onClick={() => setSelectedNodeId(node.id)}
                                    className={`w-full rounded-xl border p-3 text-left transition-all ${selectedNodeId === node.id
                                        ? "border-cyan-500/40 bg-cyan-500/10"
                                        : "border-white/5 bg-black/30 hover:border-white/15"
                                        }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-white">{node.name}</div>
                                        <span className="text-[9px] font-mono text-cyan-300">{node.cost || 1}</span>
                                    </div>
                                    <div className="mt-1 text-[9px] font-mono text-gray-500">{node.id} • {node.type}</div>
                                </button>
                            ))}
                        </div>

                        <div className="col-span-2">
                            {selectedNode ? (
                                <div className="space-y-4 rounded-2xl border border-white/5 bg-black/20 p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-[10px] font-black uppercase tracking-widest text-cyan-300">Selected Node</div>
                                            <div className="mt-1 text-[9px] font-mono text-gray-500">{selectedNode.id}</div>
                                        </div>
                                        <button
                                            onClick={deleteSelectedNode}
                                            className="rounded-lg border border-red-900/30 bg-red-950/20 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-400"
                                        >
                                            Delete Node
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Name</label>
                                            <input
                                                value={selectedNode.name}
                                                onChange={(e) => updateSelectedNode({ name: e.target.value })}
                                                className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Type</label>
                                            <select
                                                value={selectedNode.type}
                                                onChange={(e) => updateSelectedNode({ type: e.target.value as TalentNode["type"] })}
                                                className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none"
                                            >
                                                <option value="passive">Passive</option>
                                                <option value="active">Active</option>
                                                <option value="stat">Stat</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Cost</label>
                                            <input
                                                type="number"
                                                value={selectedNode.cost || 1}
                                                onChange={(e) => updateSelectedNode({ cost: Number(e.target.value) || 1 })}
                                                className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Dependencies</label>
                                            <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-2 max-h-[140px] overflow-y-auto custom-scrollbar">
                                                {talentTree.nodes
                                                    .filter((node) => node.id !== selectedNode.id)
                                                    .map((node) => {
                                                        const isChecked = (selectedNode.dependencies || []).includes(node.id);
                                                        return (
                                                            <label key={`${selectedNode.id}-${node.id}`} className="flex items-center gap-2 text-[10px] text-gray-300">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={() => toggleDependency(node.id)}
                                                                />
                                                                <span>{node.name}</span>
                                                                <span className="font-mono text-gray-500">{node.id}</span>
                                                            </label>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Description</label>
                                        <textarea
                                            value={selectedNode.description}
                                            onChange={(e) => updateSelectedNode({ description: e.target.value })}
                                            rows={4}
                                            className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none resize-none"
                                        />
                                    </div>

                                    <TraitLinkManager
                                        title="Node Traits"
                                        tone="cyan"
                                        traitIds={selectedNode.grantsTraitIds || []}
                                        onLink={(traitId) => updateSelectedNode({ grantsTraitIds: [...(selectedNode.grantsTraitIds || []), traitId] })}
                                        onUnlink={(traitId) => updateSelectedNode({ grantsTraitIds: (selectedNode.grantsTraitIds || []).filter((idToKeep) => idToKeep !== traitId) })}
                                        onOpenTrait={onOpenTrait}
                                    />

                                    <div className="space-y-2">
                                        <h3 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Resolved Node Preview</h3>
                                        <TraitPayloadPreview traits={selectedNodeTraits} emptyLabel="No node traits linked yet." />
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-dashed border-white/5 bg-black/20 p-6 text-[10px] font-mono uppercase text-gray-500">
                                    Select a talent node to edit its metadata and linked traits.
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="bg-black/30 border border-dashed border-white/5 rounded-xl p-4 text-[10px] font-mono uppercase text-gray-500">
                        No talent tree registered for this occupation.
                    </div>
                )}
            </div>

            <div className="pt-4 border-t border-white/10">
                <button
                    onClick={handleSave}
                    disabled={!name}
                    className="w-full py-4 bg-teal-600 hover:bg-teal-500 disabled:opacity-30 text-white font-black uppercase tracking-[0.3em] rounded-xl transition-all text-sm shadow-[0_0_15px_rgba(20,184,166,0.5)]"
                >
                    Save Occupation And Tree
                </button>
            </div>
        </div>
    );
}
