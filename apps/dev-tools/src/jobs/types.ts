export type JobStatus = "queued" | "running" | "completed" | "cancelled" | "failed";
export type JobModality = "text" | "image" | "asset" | "route" | "mixed" | "unknown";

export interface JobStageEvent {
    stage: string;
    status: JobStatus;
    progress: number;
    at: number;
}

export interface JobRouteRef {
    path: string;
    search?: Record<string, unknown> | null;
}

export interface JobOutputRef {
    id: string;
    label: string;
    kind: string;
    href?: string | null;
    route?: JobRouteRef | null;
    previewText?: string | null;
}

export interface JobRestoreSpec {
    route: string;
    search?: Record<string, unknown> | null;
    payload: Record<string, unknown>;
}

export interface JobListItem {
    jobId: string;
    kind: string;
    title: string;
    tool: string;
    status: JobStatus;
    progress: number;
    currentStage: string;
    worldId?: string | null;
    runId?: string | null;
    parentJobId?: string | null;
    metadata?: Record<string, unknown> | null;
    outputRefs: JobOutputRef[];
    stageHistory: JobStageEvent[];
    error?: string | null;
    createdAt: number;
    updatedAt: number;
}

export interface JobDetail extends JobListItem {
    result?: unknown;
}

export interface OptimisticJobInput {
    jobId: string;
    kind: string;
    title: string;
    tool: string;
    status?: JobStatus;
    progress?: number;
    currentStage?: string;
    worldId?: string | null;
    runId?: string | null;
    parentJobId?: string | null;
    metadata?: Record<string, unknown> | null;
    outputRefs?: JobOutputRef[];
    stageHistory?: JobStageEvent[];
    error?: string | null;
}

export interface TrackedJobMetadata {
    kind?: string;
    title?: string;
    tool?: string;
    restore?: JobRestoreSpec;
    metadata?: Record<string, unknown> | null;
}

export interface JobsResponse {
    jobs: JobListItem[];
}

export function isActiveJob(job: Pick<JobListItem, "status">): boolean {
    return job.status === "queued" || job.status === "running";
}

export function isFinishedJob(job: Pick<JobListItem, "status">): boolean {
    return job.status === "completed" || job.status === "cancelled" || job.status === "failed";
}
