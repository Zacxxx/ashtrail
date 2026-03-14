import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGenerationHistory } from "../hooks/useGenerationHistory";
import { DEVTOOLS_ROUTES } from "../lib/routes";
import { deriveChildLabel } from "./model";
import { useJobs } from "./useJobs";
import type { JobListItem, JobOutputRef } from "./types";
import { isActiveJob } from "./types";

function formatRelativeTime(timestamp: number): string {
    const deltaMs = Date.now() - timestamp;
    const deltaMinutes = Math.max(0, Math.round(deltaMs / 60000));
    if (deltaMinutes < 1) return "just now";
    if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
    const deltaHours = Math.round(deltaMinutes / 60);
    if (deltaHours < 24) return `${deltaHours}h ago`;
    const deltaDays = Math.round(deltaHours / 24);
    return `${deltaDays}d ago`;
}

function questTitleForJob(job: JobListItem): string {
    if (job.kind === "quests.generate-run.v2") return "Generate Quest Run";
    if (job.kind === "quests.advance-run.v2") return "Advance Quest Run";
    if (job.kind === "quests.generate-illustration") return "Generate Quest Illustration";
    return job.title;
}

function questSubtitle(job: JobListItem, worldName?: string | null): string {
    const metadata = job.metadata || {};
    const parts = [
        typeof metadata.questTitle === "string" ? metadata.questTitle : null,
        typeof metadata.nodeIndex === "number" && typeof metadata.nodeCount === "number"
            ? `Node ${metadata.nodeIndex}/${metadata.nodeCount}`
            : null,
        typeof worldName === "string" && worldName.trim() ? worldName : null,
    ].filter(Boolean);
    return parts.join(" • ");
}

export function JobsDropdown() {
    const navigate = useNavigate();
    const { jobs, cancelJob, openOutput, redoJob, getJobDetail } = useJobs();
    const { history } = useGenerationHistory();
    const [tab, setTab] = useState<"running" | "history">("running");
    const [inspectedJobId, setInspectedJobId] = useState<string | null>(null);
    const [inspectedLabel, setInspectedLabel] = useState<string | null>(null);
    const [inspectedContent, setInspectedContent] = useState<string | null>(null);
    const [inspectedImageUrl, setInspectedImageUrl] = useState<string | null>(null);

    const worldNames = useMemo(() => Object.fromEntries(
        history.map((entry) => [entry.id, entry.name || entry.prompt || entry.id]),
    ), [history]);

    const childJobsByParent = useMemo(() => jobs.reduce<Record<string, JobListItem[]>>((acc, job) => {
        if (!job.parentJobId) return acc;
        acc[job.parentJobId] = [...(acc[job.parentJobId] || []), job];
        return acc;
    }, {}), [jobs]);
    const runningJobs = useMemo(
        () => jobs.filter((job) => !job.parentJobId && (isActiveJob(job) || (childJobsByParent[job.jobId] || []).some(isActiveJob))),
        [childJobsByParent, jobs],
    );
    const historyJobs = useMemo(
        () => jobs.filter((job) => !job.parentJobId && !isActiveJob(job) && !(childJobsByParent[job.jobId] || []).some(isActiveJob)),
        [childJobsByParent, jobs],
    );
    const displayedJobs = tab === "running" ? runningJobs : historyJobs;

    const handleOutput = async (job: JobListItem, outputRef?: JobOutputRef | null) => {
        const target = outputRef || job.outputRefs[0];
        if (!target) return;
        if (target.route?.path || target.href) {
            await openOutput(job, target);
            return;
        }
        const detail = await getJobDetail(job.jobId);
        const dataUrl = typeof detail?.result === "object" && detail?.result && "dataUrl" in detail.result
            ? String((detail.result as { dataUrl?: string }).dataUrl || "")
            : null;
        const resultText = target.previewText
            || (typeof detail?.result === "string"
                ? detail.result
                : detail?.result
                    ? JSON.stringify(detail.result, null, 2)
                    : null);
        setInspectedJobId(job.jobId);
        setInspectedLabel(target.label);
        setInspectedContent(resultText);
        setInspectedImageUrl(dataUrl || null);
    };

    return (
        <div className="absolute right-0 top-12 z-[120] w-[420px] overflow-hidden rounded-3xl border border-white/10 bg-[#071018]/95 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Job Center</div>
                    <button type="button" onClick={() => navigate(DEVTOOLS_ROUTES.jobCenter)} className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200 hover:bg-cyan-500/20">
                        Open Explorer
                    </button>
                </div>
                <div className="flex gap-2 text-[10px] font-bold uppercase tracking-[0.2em]">
                    <button type="button" onClick={() => setTab("running")} className={`rounded-full px-3 py-1 ${tab === "running" ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-gray-400"}`}>Running</button>
                    <button type="button" onClick={() => setTab("history")} className={`rounded-full px-3 py-1 ${tab === "history" ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-gray-400"}`}>History</button>
                </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-3">
                {inspectedJobId && (inspectedContent || inspectedImageUrl) && (
                    <div className="mb-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200">{inspectedLabel || "Output"}</div>
                            <button type="button" onClick={() => { setInspectedJobId(null); setInspectedLabel(null); setInspectedContent(null); setInspectedImageUrl(null); }} className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 hover:text-white">
                                Close
                            </button>
                        </div>
                        {inspectedImageUrl && (
                            <img src={inspectedImageUrl} alt={inspectedLabel || "Job output"} className="mt-3 max-h-64 w-full rounded-xl border border-white/10 bg-[#051018] object-contain" />
                        )}
                        {inspectedContent && (
                            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-[#051018] p-3 text-xs leading-relaxed text-gray-100">{inspectedContent}</pre>
                        )}
                    </div>
                )}
                {displayedJobs.length === 0 && (
                    <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-6 text-center text-sm text-gray-500">
                        No jobs in this view.
                    </div>
                )}
                <div className="space-y-3">
                    {displayedJobs.map((job) => {
                        const children = childJobsByParent[job.jobId] || [];
                        const worldName = job.worldId ? worldNames[job.worldId] : null;
                        return (
                            <div key={job.jobId} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-bold text-white">{questTitleForJob(job)}</div>
                                        <div className="mt-1 text-xs text-gray-400">{questSubtitle(job, worldName)}</div>
                                        <div className="mt-2 text-xs text-cyan-200">{job.currentStage}</div>
                                        {isActiveJob(job) && (
                                            <div className="mt-3">
                                                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                                                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-amber-300" style={{ width: `${Math.max(4, Math.min(100, job.progress))}%` }} />
                                                </div>
                                            </div>
                                        )}
                                        {!!children.length && (
                                            <div className="mt-3 space-y-2">
                                                {children.map((child) => (
                                                    <div key={child.jobId} className="rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs text-gray-300">
                                                        {deriveChildLabel(child)}: {child.status} • {child.currentStage}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <div className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-300">{job.status}</div>
                                        <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-gray-500">{formatRelativeTime(job.updatedAt)}</div>
                                    </div>
                                </div>
                                {job.error && (
                                    <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                                        {job.error}
                                    </div>
                                )}
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {!!job.outputRefs.length && (
                                        <button type="button" onClick={() => void handleOutput(job)} className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200 hover:bg-cyan-500/20">
                                            Output
                                        </button>
                                    )}
                                    {isActiveJob(job) && (
                                        <button type="button" onClick={() => void cancelJob(job.jobId)} className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-red-200 hover:bg-red-500/20">
                                            Cancel
                                        </button>
                                    )}
                                    {!isActiveJob(job) && job.kind.startsWith("quests.") && (
                                        <button type="button" onClick={() => void redoJob(job.jobId)} className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200 hover:bg-amber-500/20">
                                            Redo
                                        </button>
                                    )}
                                    {!isActiveJob(job) && job.kind === "worldgen.locations.generate" && (
                                        <>
                                            <button type="button" onClick={() => void redoJob(job.jobId, "same")} className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200 hover:bg-amber-500/20">
                                                Redo Same Scope
                                            </button>
                                            <button type="button" onClick={() => void redoJob(job.jobId, "world")} className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-200 hover:bg-orange-500/20">
                                                Redo Full World
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
