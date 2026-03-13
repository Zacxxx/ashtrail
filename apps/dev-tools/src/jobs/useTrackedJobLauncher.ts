import { useCallback } from "react";
import { useJobs } from "./useJobs";
import type { JobRestoreSpec, OptimisticJobInput, TrackedJobMetadata } from "./types";

interface LaunchTrackedJobOptions<TRequest> {
    url: string;
    request: TRequest;
    restore?: JobRestoreSpec;
    metadata?: Record<string, unknown> | null;
    optimisticJob?: Omit<OptimisticJobInput, "jobId">;
}

function encodeMeta(meta: TrackedJobMetadata): string | null {
    if (!meta.kind && !meta.title && !meta.tool && !meta.restore && !meta.metadata) return null;
    const raw = JSON.stringify(meta);
    return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function useTrackedJobLauncher() {
    const { refreshJobs, registerOptimisticJob } = useJobs();

    return useCallback(async <TAccepted extends { jobId: string }, TRequest>({
        url,
        request,
        restore,
        metadata,
        optimisticJob,
    }: LaunchTrackedJobOptions<TRequest>): Promise<TAccepted> => {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        const encodedMeta = encodeMeta({
            kind: optimisticJob?.kind,
            title: optimisticJob?.title,
            tool: optimisticJob?.tool,
            restore,
            metadata: metadata ?? optimisticJob?.metadata ?? null,
        });
        if (encodedMeta) {
            headers["X-Ashtrail-Job-Meta"] = encodedMeta;
        }
        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            const details = await response.text().catch(() => "");
            throw new Error(details || `Request failed: ${response.status}`);
        }
        const accepted = await response.json() as TAccepted;
        if (optimisticJob) {
            registerOptimisticJob({
                jobId: accepted.jobId,
                ...optimisticJob,
            });
        }
        await refreshJobs();
        return accepted;
    }, [refreshJobs, registerOptimisticJob]);
}
