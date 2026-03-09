import { useEffect, useState, useMemo, useCallback } from "react";
import { Button } from "@ashtrail/ui";
import { type GenerationHistoryItem, type TemporalityConfig } from "../hooks/useGenerationHistory";
import { formatAshtrailDate, type AshtrailDate } from "../lib/calendar";
import type { LoreSnippet } from "../types/lore";
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    ReactFlowProvider,
    useNodesState,
    useEdgesState,
    Node,
    Edge,
    Position,
    Handle
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
interface TimelineTabProps {
    selectedWorld: GenerationHistoryItem | null;
}

// Custom Node to display an event beautifully
function CustomEventNode({ data }: { data: any }) {
    const { dateStr, location, content, factions, characters } = data;
    return (
        <div className="bg-[#0a0f14] border border-white/10 rounded-xl p-5 shadow-2xl min-w-[300px] max-w-[400px] hover:border-cyan-500/50 transition-colors">
            <Handle type="target" position={Position.Left} className="w-3 h-3 bg-cyan-500 border-2 border-[#121820]" />

            <div className="text-xs font-bold text-cyan-500 tracking-widest mb-3 flex items-center justify-between">
                <span>{dateStr}</span>
                <span className="text-gray-500 px-2 py-0.5 bg-white/5 rounded text-[10px]">{location}</span>
            </div>

            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap mb-4">
                {content}
            </p>

            {(factions?.length > 0 || characters?.length > 0) && (
                <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
                    {factions?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {factions.map((f: string) => (
                                <span key={f} className="text-[9px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/30 px-1.5 py-0.5 rounded tracking-widest uppercase">
                                    {f}
                                </span>
                            ))}
                        </div>
                    )}
                    {characters?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {characters.map((c: string) => (
                                <span key={c} className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded tracking-widest uppercase">
                                    {c}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
            <Handle type="source" position={Position.Right} className="w-3 h-3 bg-cyan-500 border-2 border-[#121820]" />
        </div>
    );
}

const nodeTypes = {
    eventNode: CustomEventNode,
};

export function TimelineTab({ selectedWorld }: TimelineTabProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [events, setEvents] = useState<LoreSnippet[]>([]);
    const [temporality, setTemporality] = useState<TemporalityConfig | null>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    useEffect(() => {
        if (!selectedWorld) {
            setEvents([]);
            setTemporality(null);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        // Fetch Lore snippets as they have specific dates!
        Promise.all([
            fetch(`http://localhost:8787/api/planet/lore-snippets/${selectedWorld.id}`).then(res => res.json()),
            fetch(`http://localhost:8787/api/planet/temporality/${selectedWorld.id}`).then(res => res.json())
        ])
            .then(([loreData, temp]) => {
                const snippets: LoreSnippet[] = Array.isArray(loreData) ? loreData : [];
                setTemporality(temp);
                setEvents(snippets);
            })
            .catch(err => console.error("Failed to load timeline data", err))
            .finally(() => setIsLoading(false));
    }, [selectedWorld]);

    // Build graph whenever we have events
    useEffect(() => {
        const timelineEvents = (events || []).filter(event => event.priority !== "main" && event.date);
        if (timelineEvents.length === 0) {
            setNodes([]);
            setEdges([]);
            return;
        }

        // Sort events chronologically. Need a helper to compare AshtrailDate. Assuming simple year/month/day struct.
        const sortedEvents = [...timelineEvents].sort((a, b) => {
            const aDate = a.date as AshtrailDate;
            const bDate = b.date as AshtrailDate;
            if (aDate.year !== bDate.year) return aDate.year - bDate.year;
            if (aDate.month !== bDate.month) return aDate.month - bDate.month;
            return aDate.day - bDate.day;
        });

        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];

        sortedEvents.forEach((ev, index) => {
            const dateStr = formatAshtrailDate(ev.date as AshtrailDate, temporality || undefined);

            newNodes.push({
                id: ev.id,
                type: 'eventNode',
                // Position sequentially horizontally with a slight vertical stagger if we want, or just a straight line.
                // Let's do a straight line roughly centered vertically.
                position: { x: index * 450, y: Math.sin(index) * 50 + 200 },
                data: {
                    dateStr,
                    location: ev.location,
                    content: ev.content,
                    factions: ev.involvedFactions || [],
                    characters: ev.involvedCharacters || []
                }
            });

            if (index > 0) {
                newEdges.push({
                    id: `e-${sortedEvents[index - 1].id}-${ev.id}`,
                    source: sortedEvents[index - 1].id,
                    target: ev.id,
                    type: 'smoothstep', // Gives it a nice angled or straight flow
                    animated: true,
                    style: { stroke: '#06b6d4', strokeWidth: 2, opacity: 0.5 }
                });
            }
        });

        setNodes(newNodes);
        setEdges(newEdges);
    }, [events, temporality, setNodes, setEdges]);

    if (!selectedWorld) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#121820] border border-[#1f2937] rounded-xl opacity-80 h-full">
                <div className="text-5xl mb-4">⌛</div>
                <h3 className="text-xl font-bold tracking-widest text-gray-400 mb-2 uppercase">No World Selected</h3>
                <p className="text-gray-500 max-w-sm text-center">
                    Please select a world from the World tab to visualize its timeline.
                </p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#121820] border border-[#1f2937] rounded-xl opacity-80 h-full">
                <div className="text-center text-cyan-500 text-sm animate-pulse tracking-widest font-bold">LOADING CHRONICLES...</div>
            </div>
        );
    }

    if (events.filter(event => event.priority !== "main" && event.date).length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#121820] border border-[#1f2937] rounded-xl opacity-80 h-full">
                <div className="text-4xl mb-4">📜</div>
                <h3 className="text-lg font-bold tracking-widest text-gray-400 mb-2 uppercase">The Timeline is Empty</h3>
                <p className="text-sm text-gray-500 max-w-sm text-center">
                    Navigate to the Lore tab and generate some localized history to populate this timeline.
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 bg-[#0a0f14] border border-[#1f2937] rounded-xl flex flex-col overflow-hidden relative shadow-2xl h-full">
            <div className="absolute inset-0 z-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-900/20 via-transparent to-transparent" />

            <div className="p-4 border-b border-white/5 bg-[#0a0f14]/80 backdrop-blur-md z-10 shrink-0 flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-bold tracking-[0.2em] text-cyan-400">HISTORICAL TIMELINE</h2>
                    <p className="text-[10px] text-gray-500 mt-0.5 tracking-widest uppercase">{events.length} Causal Nodes Detected</p>
                </div>
                <div className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded text-[9px] font-bold text-cyan-400 tracking-widest uppercase shadow-[0_0_10px_rgba(6,182,212,0.1)]">
                    Scroll to parse • Drag to navigate
                </div>
            </div>

            <div className="flex-1 w-full h-full relative">
                <ReactFlowProvider>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        nodeTypes={nodeTypes}
                        fitView
                        fitViewOptions={{ padding: 0.2 }}
                        minZoom={0.1}
                        maxZoom={2}
                        className="bg-transparent"
                    >
                        <Background color="#1f2937" gap={50} size={1} />
                        <Controls className="fill-white [&>button]:bg-[#121820] [&>button]:border-white/10 [&>button]:border-b [&>button:hover]:bg-white/10" />
                        <MiniMap
                            nodeColor="#06b6d4"
                            maskColor="rgba(10, 15, 20, 0.7)"
                            className="bg-[#121820] border border-white/10 rounded-lg overflow-hidden"
                        />
                    </ReactFlow>
                </ReactFlowProvider>
            </div>
        </div>
    );
}
