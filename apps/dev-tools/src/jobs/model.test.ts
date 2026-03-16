import { describe, expect, it } from "vitest";
import { aggregateFamilyProgress, classifyJobModality, deriveChildLabel, groupJobsIntoFamilies } from "./model";
import type { JobListItem } from "./types";

function makeJob(overrides: Partial<JobListItem> = {}): JobListItem {
    return {
        jobId: overrides.jobId || "job-1",
        kind: overrides.kind || "events.generate",
        title: overrides.title || "Generate Event",
        tool: overrides.tool || "gameplay-engine",
        status: overrides.status || "queued",
        progress: overrides.progress ?? 0,
        currentStage: overrides.currentStage || "Queued",
        worldId: overrides.worldId ?? "world-1",
        runId: overrides.runId ?? null,
        parentJobId: overrides.parentJobId ?? null,
        metadata: overrides.metadata ?? null,
        outputRefs: overrides.outputRefs ?? [],
        stageHistory: overrides.stageHistory ?? [{ stage: "Queued", status: "queued", progress: 0, at: 1 }],
        error: overrides.error ?? null,
        createdAt: overrides.createdAt ?? 1,
        updatedAt: overrides.updatedAt ?? 1,
    };
}

describe("job model", () => {
    it("classifies modality from metadata and outputs", () => {
        expect(classifyJobModality(makeJob({ metadata: { modality: "image" } }))).toBe("image");
        expect(classifyJobModality(makeJob({ metadata: { childKind: "semantics" } }))).toBe("text");
        expect(classifyJobModality(makeJob({ outputRefs: [{ id: "a", label: "asset", kind: "asset" }] }))).toBe("asset");
    });

    it("groups parent and child jobs into a family", () => {
        const parent = makeJob({ jobId: "parent", title: "Interleaved Session", status: "running", progress: 50, updatedAt: 20 });
        const child = makeJob({
            jobId: "child",
            parentJobId: "parent",
            title: "Generate Illustration",
            kind: "quests.generate-illustration",
            metadata: { childKind: "image-beat", segmentTitle: "Dust storm reveal" },
            status: "completed",
            progress: 100,
            updatedAt: 30,
        });

        const families = groupJobsIntoFamilies([parent, child]);
        expect(families).toHaveLength(1);
        expect(families[0].parent?.jobId).toBe("parent");
        expect(families[0].children[0]?.jobId).toBe("child");
        expect(families[0].modalities).toContain("image");
        expect(deriveChildLabel(child)).toBe("Dust storm reveal");
    });

    it("creates orphaned families when parent is missing", () => {
        const orphan = makeJob({
            jobId: "child-only",
            parentJobId: "ghost-parent",
            metadata: { childKind: "text-beat" },
            updatedAt: 40,
        });
        const families = groupJobsIntoFamilies([orphan]);
        expect(families[0]?.isOrphaned).toBe(true);
        expect(families[0]?.children).toHaveLength(1);
    });

    it("aggregates family progress", () => {
        const progress = aggregateFamilyProgress(
            makeJob({ progress: 40 }),
            [makeJob({ progress: 100 }), makeJob({ progress: 20 })],
        );
        expect(progress).toBe(53);
    });
});
