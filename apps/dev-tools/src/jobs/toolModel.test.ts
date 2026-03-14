import { describe, expect, it } from "vitest";
import { buildToolUsageSnapshot, groupToolsByProductArea, groupToolsByTechnicalCategory, matchesToolFilters } from "./toolModel";
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

describe("tool model", () => {
    it("aggregates used, active, and last used from runtime jobs", () => {
        const snapshots = buildToolUsageSnapshot([
            makeJob({ tool: "exploration", updatedAt: 5, status: "queued" }),
            makeJob({ tool: "exploration", updatedAt: 8, status: "running", jobId: "job-2" }),
            makeJob({ tool: "exploration", updatedAt: 12, status: "completed", jobId: "job-3", parentJobId: "parent-1" }),
        ]);

        const exploration = snapshots.find((entry) => entry.toolId === "exploration");
        expect(exploration).toMatchObject({
            usedCount: 3,
            activeCount: 2,
            lastUsedAt: 12,
            technicalCategory: "simulation",
            productAreas: ["gameplay", "world-building"],
        });
    });

    it("creates uncatalogued tools from observed jobs", () => {
        const snapshots = buildToolUsageSnapshot([makeJob({ tool: "mystery-tool" })]);
        const mysteryTool = snapshots.find((entry) => entry.toolId === "mystery-tool");

        expect(mysteryTool?.technicalCategory).toBe("uncatalogued");
        expect(mysteryTool?.productAreas).toEqual(["uncatalogued"]);
        expect(mysteryTool?.available).toBe(false);
    });

    it("groups tools by technical and product categories", () => {
        const snapshots = buildToolUsageSnapshot([
            makeJob({ tool: "exploration" }),
            makeJob({ tool: "quests", jobId: "job-2" }),
        ]);

        expect(groupToolsByTechnicalCategory(snapshots).find((group) => group.category === "simulation")?.tools[0]?.toolId).toBe("exploration");
        expect(groupToolsByProductArea(snapshots).find((group) => group.category === "quests")?.tools[0]?.toolId).toBe("quests");
    });

    it("filters on search, technical category, and product category", () => {
        const exploration = buildToolUsageSnapshot([makeJob({ tool: "exploration" })]).find((entry) => entry.toolId === "exploration");
        expect(exploration).toBeDefined();

        expect(matchesToolFilters(exploration!, {
            search: "world",
            technicalCategory: "simulation",
            productArea: "world-building",
            usageStatus: "used",
        })).toBe(true);

        expect(matchesToolFilters(exploration!, {
            search: "quest",
            technicalCategory: "simulation",
            productArea: "all",
            usageStatus: "all",
        })).toBe(false);
    });
});
