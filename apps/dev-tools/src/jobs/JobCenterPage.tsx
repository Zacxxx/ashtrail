import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useGenerationHistory } from "../hooks/useGenerationHistory";
import { isGeneratedMediaAudioResult, type GeneratedMediaAudioResult } from "../media/generatedMediaAudio";
import { SyncedNarratedVideoPlayer } from "../media/SyncedNarratedVideoPlayer";
import { isGeneratedMediaVideoResult, type GeneratedMediaVideoResult } from "../media/generatedMediaVideo";
import {
    PRODUCT_TOOL_AREA_LABELS,
    PRODUCT_TOOL_AREA_ORDER,
    TECHNICAL_TOOL_CATEGORY_LABELS,
    TECHNICAL_TOOL_CATEGORY_ORDER,
    type ProductToolArea,
    type TechnicalToolCategory,
} from "./toolCatalog";
import { buildToolUsageSnapshot, groupToolsByProductArea, groupToolsByTechnicalCategory, matchesToolFilters, type ToolUsageSnapshot } from "./toolModel";
import { aggregateFamilyProgress, groupJobsIntoFamilies, type JobFamily, type JobFamilyTimelineEvent, type JobNode } from "./model";
import type { JobDetail, JobModality, JobOutputRef } from "./types";
import { isActiveJob } from "./types";
import { useJobs } from "./useJobs";

type JobCenterTab = "overview" | "tools";
type FamilyScope = "all" | "running" | "history";
type ToolUsageFilter = "all" | "used" | "unused" | "active";
type ToolGroupMode = "technical" | "product";

function formatRelativeTime(timestamp: number): string {
    const deltaMs = Date.now() - timestamp;
    const deltaMinutes = Math.max(0, Math.round(deltaMs / 60000));
    if (deltaMinutes < 1) return "just now";
    if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
    const deltaHours = Math.round(deltaMinutes / 60);
    if (deltaHours < 24) return `${deltaHours}h ago`;
    return `${Math.round(deltaHours / 24)}d ago`;
}

function formatAbsoluteTime(timestamp: number | null): string {
    if (timestamp === null) return "Never";
    return new Date(timestamp).toLocaleString();
}

function modalityTone(modality: JobModality): string {
    switch (modality) {
        case "text":
            return "border-cyan-500/30 bg-cyan-500/10 text-cyan-100";
        case "image":
            return "border-amber-500/30 bg-amber-500/10 text-amber-100";
        case "asset":
            return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
        case "route":
            return "border-violet-500/30 bg-violet-500/10 text-violet-100";
        case "mixed":
            return "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-100";
        default:
            return "border-white/10 bg-white/5 text-gray-200";
    }
}

function statusTone(status: JobNode["status"]): string {
    switch (status) {
        case "running":
            return "border-cyan-500/30 bg-cyan-500/10 text-cyan-100";
        case "queued":
            return "border-amber-500/30 bg-amber-500/10 text-amber-100";
        case "completed":
            return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
        case "failed":
            return "border-red-500/30 bg-red-500/10 text-red-100";
        case "cancelled":
            return "border-orange-500/30 bg-orange-500/10 text-orange-100";
    }
}

function scopeFilterLabel(scope: FamilyScope, count: number): string {
    return `${scope} (${count})`;
}

function artifactStatusTone(status: GeneratedMediaAudioResult["artifact"]["status"] | GeneratedMediaVideoResult["artifact"]["status"]): string {
    switch (status) {
        case "success":
            return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
        case "partial_success":
            return "border-amber-500/30 bg-amber-500/10 text-amber-100";
        default:
            return "border-red-500/30 bg-red-500/10 text-red-100";
    }
}

function familyMatchesSearch(family: JobFamily, search: string, worldName: string | null): boolean {
    if (!search.trim()) return true;
    const haystack = [
        family.title,
        family.kind,
        family.tool,
        family.currentStage,
        worldName || "",
        ...family.nodes.map((node) => `${node.title} ${node.kind} ${node.childLabel}`),
    ]
        .join(" ")
        .toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
}

async function resolveOutputPreview(
    job: JobNode,
    outputRef: JobOutputRef,
    getJobDetail: (jobId: string) => Promise<JobDetail | null>,
): Promise<{ content: string | null; imageUrl: string | null }> {
    const detail = await getJobDetail(job.jobId);
    const dataUrl = typeof detail?.result === "object" && detail?.result && "dataUrl" in detail.result
        ? String((detail.result as { dataUrl?: string }).dataUrl || "")
        : null;
    const content = outputRef.previewText
        || (typeof detail?.result === "string"
            ? detail.result
            : detail?.result
                ? JSON.stringify(detail.result, null, 2)
                : null);
    return { content, imageUrl: dataUrl || null };
}

export function JobCenterPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { history } = useGenerationHistory();
    const { jobs, cancelJob, openOutput, redoJob, getJobDetail, refreshJobs } = useJobs();

    const [scope, setScope] = useState<FamilyScope>("all");
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [worldFilter, setWorldFilter] = useState("all");
    const [modalityFilter, setModalityFilter] = useState("all");
    const [expandedFamilyIds, setExpandedFamilyIds] = useState<string[]>([]);
    const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedDetail, setSelectedDetail] = useState<JobDetail | null>(null);
    const [previewLabel, setPreviewLabel] = useState<string | null>(null);
    const [previewContent, setPreviewContent] = useState<string | null>(null);
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

    const [toolsSearch, setToolsSearch] = useState("");
    const [technicalFilter, setTechnicalFilter] = useState<TechnicalToolCategory | "all">("all");
    const [productFilter, setProductFilter] = useState<ProductToolArea | "all">("all");
    const [usageStatusFilter, setUsageStatusFilter] = useState<ToolUsageFilter>("all");

    const activeTab: JobCenterTab = searchParams.get("tab") === "tools" ? "tools" : "overview";
    const toolGroupMode: ToolGroupMode = searchParams.get("groupBy") === "product" ? "product" : "technical";
    const selectedToolId = searchParams.get("tool");
    const overviewToolFilter = searchParams.get("tool") || "all";
    const requestedJobId = searchParams.get("jobId");

    const deferredSearch = useDeferredValue(search);
    const deferredToolsSearch = useDeferredValue(toolsSearch);

    const worldNames = useMemo(() => Object.fromEntries(
        history.map((entry) => [entry.id, entry.name || entry.prompt || entry.id]),
    ), [history]);

    const families = useMemo(() => groupJobsIntoFamilies(jobs), [jobs]);
    const toolSnapshots = useMemo(() => buildToolUsageSnapshot(jobs), [jobs]);

    const counts = useMemo(() => ({
        all: families.length,
        running: families.filter((family) => family.nodes.some(isActiveJob)).length,
        history: families.filter((family) => family.nodes.every((node) => !isActiveJob(node))).length,
    }), [families]);

    const overviewToolOptions = useMemo(() => ["all", ...toolSnapshots.map((tool) => tool.toolId)], [toolSnapshots]);
    const worlds = useMemo(() => ["all", ...Array.from(new Set(families.map((family) => family.worldId).filter(Boolean) as string[])).sort()], [families]);
    const modalities = useMemo(() => ["all", ...Array.from(new Set(families.flatMap((family) => family.modalities))).sort()], [families]);

    const hasOverviewFilters = scope !== "all"
        || Boolean(deferredSearch.trim())
        || overviewToolFilter !== "all"
        || statusFilter !== "all"
        || worldFilter !== "all"
        || modalityFilter !== "all";

    const filteredFamilies = useMemo(() => families.filter((family) => {
        const worldName = family.worldId ? worldNames[family.worldId] || family.worldId : null;
        const matchesScope = scope === "all"
            ? true
            : scope === "running"
                ? family.nodes.some(isActiveJob)
                : family.nodes.every((node) => !isActiveJob(node));
        const matchesTool = overviewToolFilter === "all" || family.tool === overviewToolFilter;
        const matchesStatus = statusFilter === "all" || family.status === statusFilter;
        const matchesWorld = worldFilter === "all" || family.worldId === worldFilter;
        const matchesModality = modalityFilter === "all" || family.modalities.includes(modalityFilter as JobModality);
        return matchesScope
            && matchesTool
            && matchesStatus
            && matchesWorld
            && matchesModality
            && familyMatchesSearch(family, deferredSearch, worldName);
    }), [deferredSearch, families, modalityFilter, overviewToolFilter, scope, statusFilter, worldFilter, worldNames]);

    const selectedFamily = useMemo(() => {
        const matchingFiltered = filteredFamilies.find((family) => family.familyId === selectedFamilyId);
        if (matchingFiltered) return matchingFiltered;
        if (filteredFamilies.length > 0) return filteredFamilies[0];
        if (hasOverviewFilters) return null;
        return families.find((family) => family.familyId === selectedFamilyId) || families[0] || null;
    }, [families, filteredFamilies, hasOverviewFilters, selectedFamilyId]);

    const selectedNode = useMemo(() => {
        if (!selectedFamily) return null;
        return selectedFamily.nodes.find((node) => node.jobId === selectedNodeId)
            || selectedFamily.parent
            || selectedFamily.children[0]
            || null;
    }, [selectedFamily, selectedNodeId]);

    const filteredToolSnapshots = useMemo(() => toolSnapshots.filter((tool) => matchesToolFilters(tool, {
        search: deferredToolsSearch,
        technicalCategory: technicalFilter,
        productArea: productFilter,
        usageStatus: usageStatusFilter,
    })), [deferredToolsSearch, productFilter, technicalFilter, toolSnapshots, usageStatusFilter]);

    const technicalGroups = useMemo(() => groupToolsByTechnicalCategory(filteredToolSnapshots), [filteredToolSnapshots]);
    const productGroups = useMemo(() => groupToolsByProductArea(filteredToolSnapshots), [filteredToolSnapshots]);
    const uncataloguedTools = useMemo(() => filteredToolSnapshots.filter((tool) => tool.isUncatalogued), [filteredToolSnapshots]);

    const toolCounts = useMemo(() => ({
        available: toolSnapshots.filter((tool) => tool.available).length,
        used: toolSnapshots.filter((tool) => tool.usedCount > 0).length,
        active: toolSnapshots.filter((tool) => tool.activeCount > 0).length,
        unused: toolSnapshots.filter((tool) => tool.available && tool.usedCount === 0).length,
    }), [toolSnapshots]);

    useEffect(() => {
        void refreshJobs();
    }, [refreshJobs]);

    useEffect(() => {
        if (!requestedJobId) return;
        const family = families.find((entry) => entry.nodes.some((node) => node.jobId === requestedJobId));
        if (!family) return;
        setSelectedFamilyId(family.familyId);
        setSelectedNodeId(requestedJobId);
        setExpandedFamilyIds((previous) => previous.includes(family.familyId) ? previous : [...previous, family.familyId]);
    }, [families, requestedJobId]);

    useEffect(() => {
        if (activeTab !== "overview" || !selectedFamily) return;
        setSelectedFamilyId(selectedFamily.familyId);
        setExpandedFamilyIds((previous) => previous.includes(selectedFamily.familyId) ? previous : [...previous, selectedFamily.familyId]);
        const preferredNodeId = requestedJobId && selectedFamily.nodes.some((node) => node.jobId === requestedJobId)
            ? requestedJobId
            : selectedNodeId && selectedFamily.nodes.some((node) => node.jobId === selectedNodeId)
                ? selectedNodeId
                : selectedFamily.parent?.jobId || selectedFamily.children[0]?.jobId || null;
        if (!preferredNodeId) return;
        if (preferredNodeId !== selectedNodeId) {
            setSelectedNodeId(preferredNodeId);
        }
        if (requestedJobId === preferredNodeId) return;
        const next = new URLSearchParams(searchParams);
        next.set("jobId", preferredNodeId);
        setSearchParams(next, { replace: true });
    }, [activeTab, requestedJobId, searchParams, selectedFamily, selectedNodeId, setSearchParams]);

    useEffect(() => {
        if (!selectedNode) {
            setSelectedDetail(null);
            return;
        }
        let cancelled = false;
        void getJobDetail(selectedNode.jobId).then((detail) => {
            if (!cancelled) {
                setSelectedDetail(detail);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [getJobDetail, selectedNode]);

    useEffect(() => {
        if (activeTab !== "tools" || !selectedToolId) return;
        const element = document.getElementById(`tool-card-${selectedToolId}`);
        element?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }, [activeTab, filteredToolSnapshots, selectedToolId]);

    const updateSearch = (mutate: (params: URLSearchParams) => void) => {
        const next = new URLSearchParams(searchParams);
        mutate(next);
        setSearchParams(next, { replace: true });
    };

    const handleSelectNode = (familyId: string, nodeId: string) => {
        setSelectedFamilyId(familyId);
        setSelectedNodeId(nodeId);
        setExpandedFamilyIds((previous) => previous.includes(familyId) ? previous : [...previous, familyId]);
        updateSearch((next) => {
            next.set("jobId", nodeId);
            next.set("tab", "overview");
        });
    };

    const handleToggleFamily = (familyId: string) => {
        setExpandedFamilyIds((previous) => previous.includes(familyId)
            ? previous.filter((entry) => entry !== familyId)
            : [...previous, familyId]);
    };

    const handleOutput = async (job: JobNode, outputRef: JobOutputRef) => {
        if (outputRef.route?.path || outputRef.href) {
            await openOutput(job, outputRef);
            return;
        }
        const preview = await resolveOutputPreview(job, outputRef, getJobDetail);
        setPreviewLabel(outputRef.label);
        setPreviewContent(preview.content);
        setPreviewImageUrl(preview.imageUrl);
    };

    const handleTabChange = (tab: JobCenterTab) => {
        updateSearch((next) => {
            next.set("tab", tab);
        });
    };

    const handleOverviewToolFilterChange = (toolId: string) => {
        setSelectedFamilyId(null);
        setSelectedNodeId(null);
        updateSearch((next) => {
            if (toolId === "all") next.delete("tool");
            else next.set("tool", toolId);
            next.set("tab", "overview");
            next.delete("jobId");
        });
    };

    const handleSelectTool = (toolId: string) => {
        updateSearch((next) => {
            next.set("tab", "tools");
            next.set("tool", toolId);
        });
    };

    const handleViewJobsForTool = (toolId: string) => {
        setSelectedFamilyId(null);
        setSelectedNodeId(null);
        updateSearch((next) => {
            next.set("tab", "overview");
            next.set("tool", toolId);
            next.delete("jobId");
        });
    };

    const activeTimeline = selectedFamily?.timeline || [];
    const activeOutputs = selectedNode?.outputRefs || [];
    const activeWorldName = selectedFamily?.worldId ? (worldNames[selectedFamily.worldId] || selectedFamily.worldId) : null;
    const activeMediaArtifact = selectedDetail && isGeneratedMediaAudioResult(selectedDetail.result)
        ? selectedDetail.result
        : null;
    const activeVideoArtifact = selectedDetail && isGeneratedMediaVideoResult(selectedDetail.result)
        ? selectedDetail.result
        : null;

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_28%),linear-gradient(180deg,_#071018_0%,_#03070b_100%)] px-5 pb-8 pt-24 text-gray-200 md:px-8">
            <div className="mx-auto max-w-[1440px]">
                <div className="mb-6 rounded-[28px] border border-white/10 bg-black/25 p-5 shadow-2xl backdrop-blur-xl">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <div className="text-[11px] font-black uppercase tracking-[0.34em] text-cyan-200">Job Center Explorer</div>
                            <h1 className="mt-2 text-3xl font-black tracking-[0.08em] text-white">Families, stages, modalities, tools</h1>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
                                Inspect job families in one view, then pivot into the current tool surface with explicit technical and product categories.
                            </p>
                        </div>
                        <div role="tablist" aria-label="Job Center views" className="flex flex-wrap gap-2 self-start">
                            <TabButton id="jobcenter-tab-overview" panelId="jobcenter-panel-overview" selected={activeTab === "overview"} onClick={() => handleTabChange("overview")}>
                                Overview
                            </TabButton>
                            <TabButton id="jobcenter-tab-tools" panelId="jobcenter-panel-tools" selected={activeTab === "tools"} onClick={() => handleTabChange("tools")}>
                                Tools
                            </TabButton>
                        </div>
                    </div>
                    {activeTab === "overview" ? (
                        <div id="jobcenter-panel-overview" role="tabpanel" aria-labelledby="jobcenter-tab-overview" className="mt-5 space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {(["all", "running", "history"] as const).map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setScope(value)}
                                        className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] ${scope === value ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-white/5 text-gray-400 hover:text-white"}`}
                                    >
                                        {scopeFilterLabel(value, counts[value])}
                                    </button>
                                ))}
                            </div>
                            <div className="grid gap-3 lg:grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))]">
                                <label className="flex min-w-0 flex-col gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">
                                    Search
                                    <input
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder="Quest, worldgen, interleaved..."
                                        className="rounded-2xl border border-white/10 bg-[#07141d] px-4 py-3 text-sm tracking-normal text-white outline-none transition focus:border-cyan-400/50"
                                    />
                                </label>
                                <label className="flex flex-col gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">
                                    Tool
                                    <select value={overviewToolFilter} onChange={(event) => handleOverviewToolFilterChange(event.target.value)} className="rounded-2xl border border-white/10 bg-[#07141d] px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50">
                                        {overviewToolOptions.map((tool) => <option key={tool} value={tool}>{tool}</option>)}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">
                                    Status
                                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-2xl border border-white/10 bg-[#07141d] px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50">
                                        {["all", "queued", "running", "completed", "failed", "cancelled"].map((status) => <option key={status} value={status}>{status}</option>)}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">
                                    World
                                    <select value={worldFilter} onChange={(event) => setWorldFilter(event.target.value)} className="rounded-2xl border border-white/10 bg-[#07141d] px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50">
                                        {worlds.map((worldId) => <option key={worldId} value={worldId}>{worldId === "all" ? "all" : (worldNames[worldId] || worldId)}</option>)}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">
                                    Modality
                                    <select value={modalityFilter} onChange={(event) => setModalityFilter(event.target.value)} className="rounded-2xl border border-white/10 bg-[#07141d] px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50">
                                        {modalities.map((modality) => <option key={modality} value={modality}>{modality}</option>)}
                                    </select>
                                </label>
                            </div>
                        </div>
                    ) : (
                        <div id="jobcenter-panel-tools" role="tabpanel" aria-labelledby="jobcenter-tab-tools" className="mt-5 space-y-4">
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <StatCard label="Available" value={String(toolCounts.available)} />
                                <StatCard label="Used In Runtime" value={String(toolCounts.used)} />
                                <StatCard label="Active Tools" value={String(toolCounts.active)} />
                                <StatCard label="Unused" value={String(toolCounts.unused)} />
                            </div>
                            <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
                                <label className="flex min-w-0 flex-col gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">
                                    Search
                                    <input
                                        value={toolsSearch}
                                        onChange={(event) => setToolsSearch(event.target.value)}
                                        placeholder="exploration, gameplay, world building..."
                                        className="rounded-2xl border border-white/10 bg-[#07141d] px-4 py-3 text-sm tracking-normal text-white outline-none transition focus:border-cyan-400/50"
                                    />
                                </label>
                                <label className="flex flex-col gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">
                                    Technical category
                                    <select value={technicalFilter} onChange={(event) => setTechnicalFilter(event.target.value as TechnicalToolCategory | "all")} className="rounded-2xl border border-white/10 bg-[#07141d] px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50">
                                        <option value="all">all</option>
                                        {TECHNICAL_TOOL_CATEGORY_ORDER.map((category) => <option key={category} value={category}>{TECHNICAL_TOOL_CATEGORY_LABELS[category]}</option>)}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">
                                    Product category
                                    <select value={productFilter} onChange={(event) => setProductFilter(event.target.value as ProductToolArea | "all")} className="rounded-2xl border border-white/10 bg-[#07141d] px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50">
                                        <option value="all">all</option>
                                        {PRODUCT_TOOL_AREA_ORDER.map((category) => <option key={category} value={category}>{PRODUCT_TOOL_AREA_LABELS[category]}</option>)}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">
                                    Usage status
                                    <select value={usageStatusFilter} onChange={(event) => setUsageStatusFilter(event.target.value as ToolUsageFilter)} className="rounded-2xl border border-white/10 bg-[#07141d] px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50">
                                        {["all", "used", "unused", "active"].map((status) => <option key={status} value={status}>{status}</option>)}
                                    </select>
                                </label>
                            </div>
                        </div>
                    )}
                </div>
                {activeTab === "overview" ? (
                    <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
                        <aside className="rounded-[28px] border border-white/10 bg-black/25 p-4 shadow-2xl backdrop-blur-xl">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.26em] text-cyan-200">Families</div>
                                    <div className="mt-1 text-xs text-gray-500">{filteredFamilies.length} visible families</div>
                                </div>
                                <button type="button" onClick={() => void refreshJobs()} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-gray-300 hover:text-white">
                                    Refresh
                                </button>
                            </div>
                            <div role="tree" aria-label="Job families" className="space-y-3">
                                {filteredFamilies.length === 0 && (
                                    <div className="rounded-3xl border border-dashed border-white/10 bg-[#050b11] px-4 py-8 text-center text-sm text-gray-500">
                                        No job families match the current filters.
                                    </div>
                                )}
                                {filteredFamilies.map((family) => {
                                    const isExpanded = expandedFamilyIds.includes(family.familyId);
                                    const worldName = family.worldId ? (worldNames[family.worldId] || family.worldId) : "No world";
                                    return (
                                        <section key={family.familyId} className={`rounded-[24px] border p-4 transition ${selectedFamily?.familyId === family.familyId ? "border-cyan-400/30 bg-cyan-500/10" : "border-white/8 bg-[#061019]/80"}`}>
                                            <div className="flex items-start gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleFamily(family.familyId)}
                                                    aria-expanded={isExpanded}
                                                    aria-controls={`family-${family.familyId}`}
                                                    className="mt-1 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs text-white"
                                                >
                                                    {isExpanded ? "-" : "+"}
                                                </button>
                                                <button
                                                    type="button"
                                                    role="treeitem"
                                                    aria-current={selectedFamily?.familyId === family.familyId}
                                                    onClick={() => handleSelectNode(family.familyId, family.parent?.jobId || family.children[0]?.jobId || family.familyId)}
                                                    className="min-w-0 flex-1 text-left"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="truncate text-sm font-black uppercase tracking-[0.14em] text-white">{family.title}</div>
                                                            <div className="mt-1 text-xs text-gray-400">{worldName} | {family.tool} | {family.kind}</div>
                                                        </div>
                                                        <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${statusTone(family.parent || family.children[0])}`}>
                                                            {family.status}
                                                        </span>
                                                    </div>
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {family.modalities.map((modality) => (
                                                            <span key={modality} className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${modalityTone(modality)}`}>
                                                                {modality}
                                                            </span>
                                                        ))}
                                                    </div>
                                                    <div className="mt-3 grid gap-2 text-[11px] text-gray-400 md:grid-cols-2">
                                                        <span>Stage: {family.currentStage}</span>
                                                        <span>Updated: {formatRelativeTime(family.updatedAt)}</span>
                                                    </div>
                                                </button>
                                            </div>
                                            {isExpanded && (
                                                <div id={`family-${family.familyId}`} className="mt-4 space-y-2 border-t border-white/8 pt-4">
                                                    {family.nodes.map((node) => (
                                                        <button
                                                            key={node.jobId}
                                                            type="button"
                                                            role="treeitem"
                                                            onClick={() => handleSelectNode(family.familyId, node.jobId)}
                                                            className={`w-full rounded-2xl border px-3 py-3 text-left ${selectedNode?.jobId === node.jobId ? "border-cyan-400/30 bg-cyan-500/10" : "border-white/8 bg-[#04090e]"}`}
                                                        >
                                                            <div className="flex items-center justify-between gap-3">
                                                                <div className="min-w-0">
                                                                    <div className="truncate text-xs font-black uppercase tracking-[0.18em] text-white">{node.parentJobId ? node.childLabel : node.title}</div>
                                                                    <div className="mt-1 truncate text-[11px] text-gray-400">{node.kind}</div>
                                                                </div>
                                                                <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${modalityTone(node.modality)}`}>
                                                                    {node.modality}
                                                                </span>
                                                            </div>
                                                            <div className="mt-2 text-[11px] text-cyan-100">{node.currentStage}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </section>
                                    );
                                })}
                            </div>
                        </aside>
                        <section className="rounded-[28px] border border-white/10 bg-black/25 p-5 shadow-2xl backdrop-blur-xl">
                            {!selectedFamily || !selectedNode ? (
                                <div className="flex min-h-[60vh] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-[#050b11] text-sm text-gray-500">
                                    Select a family to inspect its jobs, stages, and outputs.
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <div className="rounded-[24px] border border-white/10 bg-[#07111a] p-5">
                                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100">
                                                        {selectedFamily.isOrphaned ? "Orphaned family" : "Job family"}
                                                    </span>
                                                    {selectedFamily.modalities.map((modality) => (
                                                        <span key={modality} className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${modalityTone(modality)}`}>
                                                            {modality}
                                                        </span>
                                                    ))}
                                                </div>
                                                <h2 className="mt-3 text-2xl font-black tracking-[0.08em] text-white">{selectedFamily.title}</h2>
                                                <div className="mt-2 text-sm text-gray-400">
                                                    {activeWorldName || "No world"} | {selectedFamily.tool} | {selectedFamily.kind}
                                                </div>
                                                <div className="mt-4 text-sm leading-6 text-gray-300">
                                                    Selected job: <span className="font-black uppercase tracking-[0.12em] text-white">{selectedNode.title}</span> | {selectedNode.currentStage}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {!!activeOutputs.length && (
                                                    <button type="button" onClick={() => void handleOutput(selectedNode, activeOutputs[0])} className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">
                                                        Open output
                                                    </button>
                                                )}
                                                {isActiveJob(selectedNode) && (
                                                    <button type="button" onClick={() => void cancelJob(selectedNode.jobId)} className="rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-red-100">
                                                        Cancel
                                                    </button>
                                                )}
                                                {!isActiveJob(selectedNode) && selectedNode.kind.startsWith("quests.") && (
                                                    <button type="button" onClick={() => void redoJob(selectedNode.jobId)} className="rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">
                                                        Redo
                                                    </button>
                                                )}
                                                {!isActiveJob(selectedNode) && selectedNode.kind === "worldgen.locations.generate" && (
                                                    <button type="button" onClick={() => void redoJob(selectedNode.jobId, "world")} className="rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-orange-100">
                                                        Redo world
                                                    </button>
                                                )}
                                                <button type="button" onClick={() => navigate(-1)} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-300">
                                                    Back
                                                </button>
                                            </div>
                                        </div>
                                        <div className="mt-5 grid gap-3 md:grid-cols-4">
                                            <StatCard label="Family progress" value={`${aggregateFamilyProgress(selectedFamily.parent, selectedFamily.children)}%`} />
                                            <StatCard label="Updated" value={formatRelativeTime(selectedFamily.updatedAt)} />
                                            <StatCard label="Children" value={String(selectedFamily.children.length)} />
                                            <StatCard label="Timeline events" value={String(activeTimeline.length)} />
                                        </div>
                                    </div>
                                    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                                        <SectionCard title="Overview">
                                            <dl className="grid gap-3 md:grid-cols-2">
                                                <DetailRow label="Job ID" value={selectedNode.jobId} />
                                                <DetailRow label="Status" value={selectedNode.status} />
                                                <DetailRow label="Current stage" value={selectedNode.currentStage} />
                                                <DetailRow label="Modality" value={selectedNode.modality} />
                                                <DetailRow label="Kind" value={selectedNode.kind} />
                                                <DetailRow label="Tool" value={selectedNode.tool} />
                                                <DetailRow label="Progress" value={`${selectedNode.progress}%`} />
                                                <DetailRow label="Updated" value={formatAbsoluteTime(selectedNode.updatedAt)} />
                                            </dl>
                                            {selectedNode.error && (
                                                <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                                                    {selectedNode.error}
                                                </div>
                                            )}
                                            {selectedDetail?.metadata && (
                                                <pre className="mt-4 max-h-48 overflow-auto rounded-2xl border border-white/8 bg-[#04090e] p-3 text-xs text-gray-300">{JSON.stringify(selectedDetail.metadata, null, 2)}</pre>
                                            )}
                                        </SectionCard>
                                        <SectionCard title="Hierarchy">
                                            <div className="space-y-3">
                                                {selectedFamily.parent && (
                                                    <HierarchyNode node={selectedFamily.parent} selectedNodeId={selectedNode.jobId} onSelect={() => handleSelectNode(selectedFamily.familyId, selectedFamily.parent.jobId)} />
                                                )}
                                                {selectedFamily.children.map((child) => (
                                                    <HierarchyNode key={child.jobId} node={child} selectedNodeId={selectedNode.jobId} onSelect={() => handleSelectNode(selectedFamily.familyId, child.jobId)} />
                                                ))}
                                                {!selectedFamily.parent && (
                                                    <div className="rounded-2xl border border-dashed border-orange-500/20 bg-orange-500/10 px-4 py-3 text-sm text-orange-100">
                                                        Parent job missing. This family is synthesized from orphan child jobs.
                                                    </div>
                                                )}
                                            </div>
                                        </SectionCard>
                                    </div>
                                    {activeMediaArtifact && (
                                        <SectionCard title="Generated Media Artifact">
                                            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                                                <div className="rounded-2xl border border-white/8 bg-[#04090e] p-4">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${artifactStatusTone(activeMediaArtifact.artifact.status)}`}>
                                                            {activeMediaArtifact.artifact.status.replace("_", " ")}
                                                        </span>
                                                        {activeMediaArtifact.artifact.metadata.tags.map((tag) => (
                                                            <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-gray-300">
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                    <h3 className="mt-4 text-xl font-black tracking-[0.06em] text-white">{activeMediaArtifact.artifact.metadata.title}</h3>
                                                    <p className="mt-3 text-sm leading-6 text-gray-300">{activeMediaArtifact.artifact.metadata.description}</p>
                                                    {activeMediaArtifact.artifact.audio && (
                                                        <div className="mt-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                                                            <div className="mb-3 flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">
                                                                <span>Audio</span>
                                                                <span>{activeMediaArtifact.artifact.audio.durationSeconds}s</span>
                                                            </div>
                                                            <audio controls preload="none" className="w-full">
                                                                <source src={activeMediaArtifact.artifact.audio.url} type={activeMediaArtifact.artifact.audio.mimeType} />
                                                            </audio>
                                                        </div>
                                                    )}
                                                    {activeMediaArtifact.transcript.finalResponseText && (
                                                        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                                                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Gemini Final Response</div>
                                                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-200">{activeMediaArtifact.transcript.finalResponseText}</p>
                                                        </div>
                                                    )}
                                                    {!!activeMediaArtifact.artifact.warnings?.length && (
                                                        <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                                                            {activeMediaArtifact.artifact.warnings.join(" ")}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="space-y-4">
                                                    {activeMediaArtifact.artifact.image && (
                                                        <div className="rounded-2xl border border-white/8 bg-[#04090e] p-4">
                                                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Associated Image</div>
                                                            <img src={activeMediaArtifact.artifact.image.url} alt={activeMediaArtifact.artifact.metadata.title} className="mt-4 w-full rounded-2xl border border-white/10 bg-black/20 object-cover" />
                                                        </div>
                                                    )}
                                                    <div className="rounded-2xl border border-white/8 bg-[#04090e] p-4">
                                                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Interleaved Trace</div>
                                                        <div className="mt-4 space-y-2 text-sm text-gray-300">
                                                            <p><span className="text-gray-500">Model:</span> {activeMediaArtifact.transcript.model}</p>
                                                            <p><span className="text-gray-500">Logical tool:</span> {activeMediaArtifact.transcript.logicalToolName}</p>
                                                            <p><span className="text-gray-500">API tool:</span> {activeMediaArtifact.transcript.apiToolName}</p>
                                                            <p><span className="text-gray-500">Thought signature:</span> {activeMediaArtifact.transcript.thoughtSignatureDetected ? "preserved" : "not detected"}</p>
                                                            <p><span className="text-gray-500">Intent:</span> {activeMediaArtifact.artifact.metadata.intent}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </SectionCard>
                                    )}
                                    {activeVideoArtifact && (
                                        <SectionCard title="Generated Media Video Artifact">
                                            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                                                <div className="rounded-2xl border border-white/8 bg-[#04090e] p-4">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${artifactStatusTone(activeVideoArtifact.artifact.status)}`}>
                                                            {activeVideoArtifact.artifact.status.replace("_", " ")}
                                                        </span>
                                                        {activeVideoArtifact.artifact.metadata.tags.map((tag) => (
                                                            <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-gray-300">
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                    <h3 className="mt-4 text-xl font-black tracking-[0.06em] text-white">{activeVideoArtifact.artifact.metadata.title}</h3>
                                                    <p className="mt-3 text-sm leading-6 text-gray-300">{activeVideoArtifact.artifact.metadata.description}</p>
                                                    {activeVideoArtifact.artifact.video && (
                                                        <div className="mt-5 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4">
                                                            <div className="mb-3 flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[0.18em] text-fuchsia-100">
                                                                <span>Video</span>
                                                                <span>{activeVideoArtifact.artifact.video.durationSeconds}s</span>
                                                            </div>
                                                            <SyncedNarratedVideoPlayer
                                                                videoUrl={activeVideoArtifact.artifact.video.url}
                                                                posterUrl={activeVideoArtifact.artifact.poster?.url}
                                                                durationSeconds={activeVideoArtifact.artifact.video.durationSeconds}
                                                                segments={activeVideoArtifact.artifact.narration?.segments || []}
                                                                keepVideoAudioDefault={activeVideoArtifact.artifact.video.keepVeoAudio}
                                                            />
                                                        </div>
                                                    )}
                                                    {activeVideoArtifact.transcript.finalResponseText && (
                                                        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                                                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Gemini Final Response</div>
                                                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-200">{activeVideoArtifact.transcript.finalResponseText}</p>
                                                        </div>
                                                    )}
                                                    {!!activeVideoArtifact.artifact.warnings?.length && (
                                                        <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                                                            {activeVideoArtifact.artifact.warnings.join(" ")}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="space-y-4">
                                                    {activeVideoArtifact.artifact.poster && (
                                                        <div className="rounded-2xl border border-white/8 bg-[#04090e] p-4">
                                                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Poster</div>
                                                            <img src={activeVideoArtifact.artifact.poster.url} alt={activeVideoArtifact.artifact.metadata.title} className="mt-4 w-full rounded-2xl border border-white/10 bg-black/20 object-cover" />
                                                        </div>
                                                    )}
                                                    <div className="rounded-2xl border border-white/8 bg-[#04090e] p-4">
                                                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Interleaved Trace</div>
                                                        <div className="mt-4 space-y-2 text-sm text-gray-300">
                                                            <p><span className="text-gray-500">Model:</span> {activeVideoArtifact.transcript.model}</p>
                                                            <p><span className="text-gray-500">Logical tool:</span> {activeVideoArtifact.transcript.logicalToolName}</p>
                                                            <p><span className="text-gray-500">API tool:</span> {activeVideoArtifact.transcript.apiToolName}</p>
                                                            <p><span className="text-gray-500">Thought signature:</span> {activeVideoArtifact.transcript.thoughtSignatureDetected ? "preserved" : "not detected"}</p>
                                                            <p><span className="text-gray-500">Intent:</span> {activeVideoArtifact.artifact.metadata.intent}</p>
                                                            <p><span className="text-gray-500">Narration:</span> {activeVideoArtifact.artifact.narration?.language || "n/a"} / {activeVideoArtifact.artifact.narration?.voiceName || "n/a"}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </SectionCard>
                                    )}
                                    <SectionCard title="Modalities">
                                        <div className="grid gap-3 lg:grid-cols-3">
                                            {(["text", "image", "asset", "route", "mixed", "unknown"] as JobModality[]).map((modality) => {
                                                const nodes = selectedFamily.nodes.filter((node) => node.modality === modality);
                                                return (
                                                    <div key={modality} className="rounded-2xl border border-white/8 bg-[#04090e] p-4">
                                                        <div className="flex items-center justify-between">
                                                            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${modalityTone(modality)}`}>{modality}</span>
                                                            <span className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{nodes.length}</span>
                                                        </div>
                                                        <div className="mt-3 space-y-2">
                                                            {nodes.length === 0 && <div className="text-sm text-gray-500">No jobs in this lane.</div>}
                                                            {nodes.map((node) => (
                                                                <button key={node.jobId} type="button" onClick={() => handleSelectNode(selectedFamily.familyId, node.jobId)} className={`w-full rounded-2xl border px-3 py-2 text-left ${selectedNode.jobId === node.jobId ? "border-cyan-400/30 bg-cyan-500/10" : "border-white/8 bg-white/5"}`}>
                                                                    <div className="text-xs font-black uppercase tracking-[0.18em] text-white">{node.parentJobId ? node.childLabel : node.title}</div>
                                                                    <div className="mt-1 text-[11px] text-gray-400">{node.currentStage}</div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </SectionCard>
                                    <SectionCard title="Stages">
                                        <div className="space-y-3">
                                            {activeTimeline.length === 0 && (
                                                <div className="rounded-2xl border border-dashed border-white/10 bg-[#04090e] px-4 py-6 text-sm text-gray-500">
                                                    No stage history recorded for this family yet.
                                                </div>
                                            )}
                                            {activeTimeline.map((event, index) => (
                                                <TimelineEvent key={`${event.jobId}-${event.at}-${index}`} event={event} selectedNodeId={selectedNode.jobId} onSelect={() => handleSelectNode(selectedFamily.familyId, event.jobId)} />
                                            ))}
                                        </div>
                                    </SectionCard>
                                    <SectionCard title="Outputs">
                                        <div className="space-y-4">
                                            <div className="flex flex-wrap gap-2">
                                                {activeOutputs.length === 0 && <span className="text-sm text-gray-500">No outputs registered for this job.</span>}
                                                {activeOutputs.map((outputRef) => (
                                                    <button key={outputRef.id} type="button" onClick={() => void handleOutput(selectedNode, outputRef)} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-200 hover:border-cyan-400/30 hover:bg-cyan-500/10 hover:text-white">
                                                        {outputRef.label}
                                                    </button>
                                                ))}
                                            </div>
                                            {(previewContent || previewImageUrl) && (
                                                <div className="rounded-3xl border border-white/10 bg-[#04090e] p-4">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-100">{previewLabel || "Output"}</div>
                                                        <button type="button" onClick={() => { setPreviewLabel(null); setPreviewContent(null); setPreviewImageUrl(null); }} className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">
                                                            Close
                                                        </button>
                                                    </div>
                                                    {previewImageUrl && (
                                                        <img src={previewImageUrl} alt={previewLabel || "Job output"} className="mt-4 max-h-[360px] w-full rounded-2xl border border-white/10 bg-black/20 object-contain" />
                                                    )}
                                                    {previewContent && (
                                                        <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-6 text-gray-200">{previewContent}</pre>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </SectionCard>
                                </div>
                            )}
                        </section>
                    </div>
                ) : (
                    <section className="rounded-[28px] border border-white/10 bg-black/25 p-5 shadow-2xl backdrop-blur-xl">
                        <div className="space-y-6">
                            <SectionCard
                                title={toolGroupMode === "technical" ? "By Technical Category" : "By Product Category"}
                                action={(
                                    <button
                                        type="button"
                                        onClick={() => updateSearch((next) => {
                                            next.set("tab", "tools");
                                            next.set("groupBy", toolGroupMode === "technical" ? "product" : "technical");
                                        })}
                                        aria-label={toolGroupMode === "technical" ? "Switch to product categories" : "Switch to technical categories"}
                                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-gray-200 hover:border-cyan-400/30 hover:text-white"
                                    >
                                        {toolGroupMode === "technical" ? "Product >" : "< Technical"}
                                    </button>
                                )}
                            >
                                <div className="space-y-5">
                                    {(toolGroupMode === "technical" ? technicalGroups : productGroups).length === 0 && <EmptyToolsState />}
                                    {(toolGroupMode === "technical" ? technicalGroups : productGroups).map((group) => (
                                        <div key={group.category} className="space-y-3">
                                            <div>
                                                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-white">{group.label}</div>
                                                <div className="mt-1 text-xs text-gray-500">{group.tools.length} tools</div>
                                            </div>
                                            <div className="grid gap-3 lg:grid-cols-2">
                                                {group.tools.map((tool) => (
                                                    <ToolCard
                                                        key={`${group.category}-${tool.toolId}`}
                                                        tool={tool}
                                                        selected={selectedToolId === tool.toolId}
                                                        withAnchorId
                                                        onSelect={() => handleSelectTool(tool.toolId)}
                                                        onOpenRoute={tool.route ? () => navigate(tool.route) : undefined}
                                                        onViewJobs={() => handleViewJobsForTool(tool.toolId)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                            {uncataloguedTools.length > 0 && (
                                <SectionCard title="Uncatalogued">
                                    <div className="grid gap-3 lg:grid-cols-2">
                                        {uncataloguedTools.map((tool) => (
                                            <ToolCard
                                                key={`uncatalogued-${tool.toolId}`}
                                                tool={tool}
                                                selected={selectedToolId === tool.toolId}
                                                onSelect={() => handleSelectTool(tool.toolId)}
                                                onViewJobs={() => handleViewJobsForTool(tool.toolId)}
                                            />
                                        ))}
                                    </div>
                                </SectionCard>
                            )}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}

function TabButton({ id, panelId, selected, onClick, children }: { id: string; panelId: string; selected: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            id={id}
            type="button"
            role="tab"
            aria-controls={panelId}
            aria-selected={selected}
            onClick={onClick}
            className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] transition ${selected ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-white/5 text-gray-400 hover:text-white"}`}
        >
            {children}
        </button>
    );
}

function EmptyToolsState() {
    return (
        <div className="rounded-3xl border border-dashed border-white/10 bg-[#050b11] px-4 py-8 text-center text-sm text-gray-500">
            No tools match the current tool filters.
        </div>
    );
}

function ToolCard({
    tool,
    selected,
    withAnchorId = false,
    onSelect,
    onOpenRoute,
    onViewJobs,
}: {
    tool: ToolUsageSnapshot;
    selected: boolean;
    withAnchorId?: boolean;
    onSelect: () => void;
    onOpenRoute?: () => void;
    onViewJobs: () => void;
}) {
    return (
        <article id={withAnchorId ? `tool-card-${tool.toolId}` : undefined} className={`rounded-[24px] border p-4 ${selected ? "border-cyan-400/30 bg-cyan-500/10" : "border-white/8 bg-[#07111a]"}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">{tool.toolId}</div>
                    <h3 className="mt-2 text-lg font-black tracking-[0.08em] text-white">{tool.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-400">{tool.description}</p>
                </div>
                <button
                    type="button"
                    onClick={onSelect}
                    aria-pressed={selected}
                    className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${selected ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-white/5 text-gray-300"}`}
                >
                    {selected ? "Selected" : "Select"}
                </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-gray-200">
                    Technical: {TECHNICAL_TOOL_CATEGORY_LABELS[tool.technicalCategory]}
                </span>
                {tool.productAreas.map((area) => (
                    <span key={area} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-gray-200">
                        Product: {PRODUCT_TOOL_AREA_LABELS[area]}
                    </span>
                ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MiniStat label="Available now" value={tool.available ? "Yes" : "No"} />
                <MiniStat label="Used before" value={tool.usedCount > 0 ? "Yes" : "No"} />
                <MiniStat label="Active jobs" value={String(tool.activeCount)} />
                <MiniStat label="Usage count" value={String(tool.usedCount)} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
                <MiniStat label="Last used" value={formatAbsoluteTime(tool.lastUsedAt)} />
                <MiniStat label="Kinds seen" value={tool.kindsSeen.length ? tool.kindsSeen.join(", ") : "None"} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                {onOpenRoute && (
                    <button type="button" onClick={onOpenRoute} className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">
                        Open tool
                    </button>
                )}
                <button type="button" onClick={onViewJobs} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-200">
                    View jobs
                </button>
            </div>
        </article>
    );
}

function MiniStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/8 bg-[#04090e] px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">{label}</div>
            <div className="mt-2 break-words text-sm text-white">{value}</div>
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/8 bg-[#04090e] px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{label}</div>
            <div className="mt-2 text-lg font-black uppercase tracking-[0.08em] text-white">{value}</div>
        </div>
    );
}

function SectionCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
    return (
        <section className="rounded-[24px] border border-white/10 bg-[#07111a] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200">{title}</div>
                {action}
            </div>
            {children}
        </section>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/8 bg-[#04090e] px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">{label}</div>
            <div className="mt-2 break-words text-sm text-white">{value}</div>
        </div>
    );
}

function HierarchyNode({ node, selectedNodeId, onSelect }: { node: JobNode; selectedNodeId: string; onSelect: () => void }) {
    return (
        <button type="button" onClick={onSelect} className={`w-full rounded-2xl border px-4 py-3 text-left ${selectedNodeId === node.jobId ? "border-cyan-400/30 bg-cyan-500/10" : "border-white/8 bg-[#04090e]"}`}>
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-white">{node.parentJobId ? node.childLabel : node.title}</div>
                    <div className="mt-1 text-[11px] text-gray-400">{node.kind} | {node.currentStage}</div>
                </div>
                <div className="flex gap-2">
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${modalityTone(node.modality)}`}>{node.modality}</span>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${statusTone(node.status)}`}>{node.status}</span>
                </div>
            </div>
        </button>
    );
}

function TimelineEvent({ event, selectedNodeId, onSelect }: { event: JobFamilyTimelineEvent; selectedNodeId: string; onSelect: () => void }) {
    return (
        <button type="button" onClick={onSelect} className={`flex w-full items-start gap-4 rounded-2xl border px-4 py-3 text-left ${selectedNodeId === event.jobId ? "border-cyan-400/30 bg-cyan-500/10" : "border-white/8 bg-[#04090e]"}`}>
            <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-cyan-300" aria-hidden />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-white">{event.isParent ? "Parent" : "Child"} | {event.jobTitle}</span>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${statusTone(event.status)}`}>{event.status}</span>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${modalityTone(event.modality)}`}>{event.modality}</span>
                </div>
                <div className="mt-2 text-sm text-cyan-100">{event.stage}</div>
                <div className="mt-1 text-[11px] text-gray-500">{formatAbsoluteTime(event.at)} | {event.progress}%</div>
            </div>
        </button>
    );
}
