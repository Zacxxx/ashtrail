import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { useNavigate } from "react-router-dom";
import type { JobDetail, JobListItem, JobOutputRef, JobRestoreSpec, JobsResponse, OptimisticJobInput } from "./types";
import { isActiveJob } from "./types";

interface JobsContextValue {
    jobs: JobListItem[];
    activeCount: number;
    isPanelOpen: boolean;
    setPanelOpen: (open: boolean) => void;
    refreshJobs: () => Promise<void>;
    getJobDetail: (jobId: string) => Promise<JobDetail | null>;
    cancelJob: (jobId: string) => Promise<void>;
    openOutput: (job: JobListItem, outputRef?: JobOutputRef | null) => Promise<void>;
    redoJob: (jobId: string) => Promise<void>;
    registerOptimisticJob: (job: OptimisticJobInput) => void;
    waitForJob: (jobId: string) => Promise<JobDetail>;
}

const JobsContext = createContext<JobsContextValue | null>(null);

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(details || `Request failed: ${response.status}`);
    }
    return response.json();
}

function buildSearch(search?: Record<string, unknown> | null): string {
    if (!search) return "";
    const params = new URLSearchParams();
    Object.entries(search).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        params.set(key, String(value));
    });
    const query = params.toString();
    return query ? `?${query}` : "";
}

export function JobsProvider({ children }: { children: ReactNode }) {
    const navigate = useNavigate();
    const [jobs, setJobs] = useState<JobListItem[]>([]);
    const [details, setDetails] = useState<Record<string, JobDetail>>({});
    const [isPanelOpen, setPanelOpen] = useState(false);

    const refreshJobs = useCallback(async () => {
        const data = await fetchJson<JobsResponse>("/api/jobs");
        setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    }, []);

    const getJobDetail = useCallback(async (jobId: string) => {
        if (details[jobId]) return details[jobId];
        const detail = await fetchJson<JobDetail>(`/api/jobs/${jobId}`);
        setDetails((previous) => ({ ...previous, [jobId]: detail }));
        return detail;
    }, [details]);

    const cancelJob = useCallback(async (jobId: string) => {
        const response = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
        if (!response.ok) {
            const details = await response.text().catch(() => "");
            throw new Error(details || `Request failed: ${response.status}`);
        }
        await refreshJobs();
    }, [refreshJobs]);

    const openOutput = useCallback(async (job: JobListItem, outputRef?: JobOutputRef | null) => {
        const target = outputRef || job.outputRefs[0];
        if (!target) return;
        if (target.route?.path) {
            navigate(`${target.route.path}${buildSearch(target.route.search)}`);
            return;
        }
        if (target.href) {
            window.open(target.href, "_blank", "noopener,noreferrer");
        }
    }, [navigate]);

    const redoJob = useCallback(async (jobId: string) => {
        const detail = await getJobDetail(jobId);
        const restore = detail?.metadata?.restore as JobRestoreSpec | undefined;
        if (!restore?.route) return;
        const params = new URLSearchParams();
        Object.entries(restore.search || {}).forEach(([key, value]) => {
            if (value === null || value === undefined) return;
            params.set(key, String(value));
        });
        params.set("restoreJob", jobId);
        navigate(`${restore.route}?${params.toString()}`);
    }, [getJobDetail, navigate]);

    const registerOptimisticJob = useCallback((job: OptimisticJobInput) => {
        const now = Date.now();
        const optimisticJob: JobListItem = {
            jobId: job.jobId,
            kind: job.kind,
            title: job.title,
            tool: job.tool,
            status: job.status || "queued",
            progress: job.progress ?? 0,
            currentStage: job.currentStage || "Queued",
            worldId: job.worldId ?? null,
            runId: job.runId ?? null,
            parentJobId: job.parentJobId ?? null,
            metadata: job.metadata ?? null,
            outputRefs: job.outputRefs ?? [],
            error: job.error ?? null,
            createdAt: now,
            updatedAt: now,
        };
        setJobs((previous) => {
            const existing = previous.find((entry) => entry.jobId === optimisticJob.jobId);
            if (existing) {
                return previous.map((entry) => entry.jobId === optimisticJob.jobId ? { ...entry, ...optimisticJob } : entry);
            }
            return [optimisticJob, ...previous];
        });
    }, []);

    const waitForJob = useCallback(async (jobId: string) => {
        for (;;) {
            await refreshJobs();
            const detail = await getJobDetail(jobId);
            if (!detail) {
                await new Promise((resolve) => window.setTimeout(resolve, 500));
                continue;
            }
            if (detail.status === "completed" || detail.status === "failed" || detail.status === "cancelled") {
                return detail;
            }
            await new Promise((resolve) => window.setTimeout(resolve, detail.status === "queued" ? 750 : 400));
        }
    }, [getJobDetail, refreshJobs]);

    useEffect(() => {
        void refreshJobs();
    }, [refreshJobs]);

    useEffect(() => {
        const hasActiveJobs = jobs.some(isActiveJob);
        const intervalMs = hasActiveJobs ? 1000 : (isPanelOpen ? 5000 : 10000);
        const intervalId = window.setInterval(() => {
            void refreshJobs();
        }, intervalMs);
        return () => window.clearInterval(intervalId);
    }, [isPanelOpen, jobs, refreshJobs]);

    const activeCount = useMemo(
        () => jobs.filter(isActiveJob).length,
        [jobs],
    );

    const value = useMemo<JobsContextValue>(() => ({
        jobs,
        activeCount,
        isPanelOpen,
        setPanelOpen,
        refreshJobs,
        getJobDetail,
        cancelJob,
        openOutput,
        redoJob,
        registerOptimisticJob,
        waitForJob,
    }), [activeCount, cancelJob, getJobDetail, isPanelOpen, jobs, openOutput, redoJob, refreshJobs, registerOptimisticJob, waitForJob]);

    return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

export function useJobs() {
    const context = useContext(JobsContext);
    if (!context) {
        throw new Error("useJobs must be used within JobsProvider");
    }
    return context;
}
