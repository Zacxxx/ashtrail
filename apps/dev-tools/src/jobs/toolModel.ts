import type { ToolCatalogEntry } from "./toolCatalog";
import {
    PRODUCT_TOOL_AREA_LABELS,
    PRODUCT_TOOL_AREA_ORDER,
    TECHNICAL_TOOL_CATEGORY_LABELS,
    TECHNICAL_TOOL_CATEGORY_ORDER,
    TOOL_CATALOG,
    TOOL_CATALOG_BY_ID,
    type ProductToolArea,
    type TechnicalToolCategory,
} from "./toolCatalog";
import type { JobListItem, JobModality, JobStatus } from "./types";
import { isActiveJob } from "./types";

export interface ToolUsageSnapshot {
    toolId: string;
    label: string;
    description: string;
    available: boolean;
    usedCount: number;
    activeCount: number;
    parentJobCount: number;
    childJobCount: number;
    lastUsedAt: number | null;
    kindsSeen: string[];
    statusesSeen: JobStatus[];
    worldIdsSeen: string[];
    technicalCategory: TechnicalToolCategory;
    productAreas: ProductToolArea[];
    defaultModalities: JobModality[];
    route?: string;
    isUncatalogued: boolean;
}

export interface ToolFilters {
    search: string;
    technicalCategory: TechnicalToolCategory | "all";
    productArea: ProductToolArea | "all";
    usageStatus: "all" | "used" | "unused" | "active";
}

export interface ToolCategoryGroup<TCategory extends string> {
    category: TCategory;
    label: string;
    tools: ToolUsageSnapshot[];
}

function fallbackLabel(toolId: string): string {
    return toolId
        .split(/[-_.]/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function makeSnapshot(toolId: string, catalogEntry?: ToolCatalogEntry): ToolUsageSnapshot {
    const defaultModalities = catalogEntry?.defaultModalities || [];
    return {
        toolId,
        label: catalogEntry?.label || fallbackLabel(toolId),
        description: catalogEntry?.description || "Observed in the current runtime but missing from the tool catalog.",
        available: catalogEntry?.isEnabled !== false && Boolean(catalogEntry),
        usedCount: 0,
        activeCount: 0,
        parentJobCount: 0,
        childJobCount: 0,
        lastUsedAt: null,
        kindsSeen: [],
        statusesSeen: [],
        worldIdsSeen: [],
        technicalCategory: catalogEntry?.technicalCategory || "uncatalogued",
        productAreas: catalogEntry?.productAreas || ["uncatalogued"],
        defaultModalities,
        route: catalogEntry?.route,
        isUncatalogued: !catalogEntry,
    };
}

export function buildToolUsageSnapshot(jobs: JobListItem[], catalog: ToolCatalogEntry[] = TOOL_CATALOG): ToolUsageSnapshot[] {
    const snapshots = new Map<string, ToolUsageSnapshot>();
    const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));

    catalog.forEach((entry) => {
        snapshots.set(entry.id, makeSnapshot(entry.id, entry));
    });

    jobs.forEach((job) => {
        const catalogEntry = catalogById.get(job.tool) || TOOL_CATALOG_BY_ID.get(job.tool);
        const snapshot = snapshots.get(job.tool) || makeSnapshot(job.tool, catalogEntry);

        snapshot.usedCount += 1;
        if (isActiveJob(job)) {
            snapshot.activeCount += 1;
        }
        if (job.parentJobId) snapshot.childJobCount += 1;
        else snapshot.parentJobCount += 1;
        snapshot.lastUsedAt = snapshot.lastUsedAt === null ? job.updatedAt : Math.max(snapshot.lastUsedAt, job.updatedAt);
        if (!snapshot.kindsSeen.includes(job.kind)) snapshot.kindsSeen.push(job.kind);
        if (!snapshot.statusesSeen.includes(job.status)) snapshot.statusesSeen.push(job.status);
        if (job.worldId && !snapshot.worldIdsSeen.includes(job.worldId)) snapshot.worldIdsSeen.push(job.worldId);

        snapshots.set(job.tool, snapshot);
    });

    return Array.from(snapshots.values())
        .map((snapshot) => ({
            ...snapshot,
            kindsSeen: [...snapshot.kindsSeen].sort(),
            statusesSeen: [...snapshot.statusesSeen].sort(),
            worldIdsSeen: [...snapshot.worldIdsSeen].sort(),
        }))
        .sort((left, right) => {
            if (left.available !== right.available) return left.available ? -1 : 1;
            if (left.usedCount !== right.usedCount) return right.usedCount - left.usedCount;
            return left.label.localeCompare(right.label);
        });
}

export function matchesToolFilters(tool: ToolUsageSnapshot, filters: ToolFilters): boolean {
    const search = filters.search.trim().toLowerCase();
    if (search) {
        const haystack = [
            tool.toolId,
            tool.label,
            tool.description,
            TECHNICAL_TOOL_CATEGORY_LABELS[tool.technicalCategory],
            ...tool.productAreas.map((entry) => PRODUCT_TOOL_AREA_LABELS[entry]),
            ...tool.kindsSeen,
        ]
            .join(" ")
            .toLowerCase();
        if (!haystack.includes(search)) return false;
    }

    if (filters.technicalCategory !== "all" && tool.technicalCategory !== filters.technicalCategory) {
        return false;
    }

    if (filters.productArea !== "all" && !tool.productAreas.includes(filters.productArea)) {
        return false;
    }

    switch (filters.usageStatus) {
        case "used":
            return tool.usedCount > 0;
        case "unused":
            return tool.available && tool.usedCount === 0;
        case "active":
            return tool.activeCount > 0;
        default:
            return true;
    }
}

export function groupToolsByTechnicalCategory(tools: ToolUsageSnapshot[]): ToolCategoryGroup<TechnicalToolCategory>[] {
    return TECHNICAL_TOOL_CATEGORY_ORDER
        .map((category) => ({
            category,
            label: TECHNICAL_TOOL_CATEGORY_LABELS[category],
            tools: tools.filter((tool) => tool.technicalCategory === category),
        }))
        .filter((group) => group.category !== "uncatalogued" && group.tools.length > 0);
}

export function groupToolsByProductArea(tools: ToolUsageSnapshot[]): ToolCategoryGroup<ProductToolArea>[] {
    return PRODUCT_TOOL_AREA_ORDER
        .map((category) => ({
            category,
            label: PRODUCT_TOOL_AREA_LABELS[category],
            tools: tools.filter((tool) => tool.productAreas.includes(category)),
        }))
        .filter((group) => group.category !== "uncatalogued" && group.tools.length > 0);
}
