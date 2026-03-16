import type { JobListItem, JobModality, JobOutputRef, JobStageEvent, JobStatus } from "./types";
import { isActiveJob } from "./types";

export interface JobNode extends JobListItem {
    modality: JobModality;
    childLabel: string;
}

export interface JobFamilyTimelineEvent extends JobStageEvent {
    jobId: string;
    jobTitle: string;
    jobKind: string;
    modality: JobModality;
    isParent: boolean;
}

export interface JobFamily {
    familyId: string;
    parent: JobNode | null;
    children: JobNode[];
    nodes: JobNode[];
    title: string;
    kind: string;
    tool: string;
    worldId: string | null;
    status: JobStatus;
    progress: number;
    currentStage: string;
    updatedAt: number;
    modalities: JobModality[];
    isOrphaned: boolean;
    timeline: JobFamilyTimelineEvent[];
}

function toTitleCase(value: string): string {
    return value
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function metadataValue(job: Pick<JobListItem, "metadata">, key: string): unknown {
    return job.metadata && typeof job.metadata === "object"
        ? (job.metadata as Record<string, unknown>)[key]
        : undefined;
}

function modalityFromOutputRefs(outputRefs: JobOutputRef[]): JobModality | null {
    const kinds = new Set<JobModality>();
    outputRefs.forEach((ref) => {
        if (ref.kind === "text") kinds.add("text");
        else if (ref.kind === "asset") kinds.add("asset");
        else if (ref.kind === "route") kinds.add("route");
    });
    if (kinds.size > 1) return "mixed";
    return kinds.values().next().value ?? null;
}

export function classifyJobModality(job: JobListItem): JobModality {
    const metadataModality = metadataValue(job, "modality");
    if (typeof metadataModality === "string") {
        if (metadataModality === "image") return "image";
        if (metadataModality === "text") return "text";
        if (metadataModality === "asset") return "asset";
        if (metadataModality === "route") return "route";
    }

    const childKind = metadataValue(job, "childKind");
    if (typeof childKind === "string") {
        if (/(image|illustration|portrait)/i.test(childKind)) return "image";
        if (/(text|semantics|brief|glossary|story)/i.test(childKind)) return "text";
        if (/(asset|pack|palette)/i.test(childKind)) return "asset";
    }

    const outputRefModality = modalityFromOutputRefs(job.outputRefs);
    if (outputRefModality) return outputRefModality;

    const signature = `${job.kind} ${job.title}`;
    if (/(image|portrait|illustration|vision)/i.test(signature)) return "image";
    if (/(asset|sprite|pack|palette)/i.test(signature)) return "asset";
    if (/(text|story|event|semantics|prompt|character)/i.test(signature)) return "text";
    if (/route/i.test(signature)) return "route";
    return "unknown";
}

export function deriveChildLabel(job: JobListItem): string {
    const segmentTitle = metadataValue(job, "segmentTitle");
    if (typeof segmentTitle === "string" && segmentTitle.trim()) {
        return segmentTitle;
    }
    const childKind = metadataValue(job, "childKind");
    if (typeof childKind === "string" && childKind.trim()) {
        return toTitleCase(childKind);
    }
    if (job.parentJobId) {
        return toTitleCase(job.title || job.kind.split(".").pop() || "Child Job");
    }
    return job.title;
}

export function aggregateFamilyProgress(parent: JobListItem | null, children: JobListItem[]): number {
    const progressValues = [parent?.progress, ...children.map((child) => child.progress)]
        .filter((value): value is number => typeof value === "number");
    if (progressValues.length === 0) return 0;
    return Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length);
}

function normalizeNode(job: JobListItem): JobNode {
    return {
        ...job,
        modality: classifyJobModality(job),
        childLabel: deriveChildLabel(job),
    };
}

function rankStatus(statuses: JobStatus[]): JobStatus {
    if (statuses.some((status) => status === "running")) return "running";
    if (statuses.some((status) => status === "queued")) return "queued";
    if (statuses.some((status) => status === "failed")) return "failed";
    if (statuses.some((status) => status === "cancelled")) return "cancelled";
    return "completed";
}

function buildTimeline(parent: JobNode | null, children: JobNode[]): JobFamilyTimelineEvent[] {
    return [parent, ...children]
        .filter((node): node is JobNode => Boolean(node))
        .flatMap((node) =>
            (node.stageHistory || []).map((event) => ({
                ...event,
                jobId: node.jobId,
                jobTitle: node.title,
                jobKind: node.kind,
                modality: node.modality,
                isParent: parent?.jobId === node.jobId,
            })),
        )
        .sort((left, right) => left.at - right.at);
}

function collectModalities(parent: JobNode | null, children: JobNode[]): JobModality[] {
    const source = children.length > 0 ? children : parent ? [parent] : [];
    const values = Array.from(new Set(source.map((node) => node.modality)));
    return values.length > 1 ? (values.includes("mixed") ? values : [...values]) : values;
}

function fallbackStage(parent: JobNode | null, children: JobNode[]): string {
    return parent?.currentStage
        || children.find((child) => isActiveJob(child))?.currentStage
        || children[0]?.currentStage
        || "Unknown";
}

export function groupJobsIntoFamilies(jobs: JobListItem[]): JobFamily[] {
    const normalized = jobs.map(normalizeNode);
    const byId = new Map(normalized.map((job) => [job.jobId, job]));
    const childrenByParent = new Map<string, JobNode[]>();

    normalized.forEach((job) => {
        if (!job.parentJobId) return;
        const children = childrenByParent.get(job.parentJobId) || [];
        children.push(job);
        childrenByParent.set(job.parentJobId, children);
    });

    const familyRoots = normalized.filter((job) => !job.parentJobId);
    const orphanedParentIds = Array.from(childrenByParent.keys()).filter((parentId) => !byId.has(parentId));

    const families: JobFamily[] = familyRoots.map((root) => {
        const children = (childrenByParent.get(root.jobId) || []).sort((left, right) => right.updatedAt - left.updatedAt);
        const modalities = collectModalities(root, children);
        return {
            familyId: root.jobId,
            parent: root,
            children,
            nodes: [root, ...children],
            title: root.title,
            kind: root.kind,
            tool: root.tool,
            worldId: root.worldId ?? null,
            status: rankStatus([root.status, ...children.map((child) => child.status)]),
            progress: aggregateFamilyProgress(root, children),
            currentStage: fallbackStage(root, children),
            updatedAt: Math.max(root.updatedAt, ...children.map((child) => child.updatedAt)),
            modalities,
            isOrphaned: false,
            timeline: buildTimeline(root, children),
        };
    });

    orphanedParentIds.forEach((parentId) => {
        const children = (childrenByParent.get(parentId) || []).sort((left, right) => right.updatedAt - left.updatedAt);
        if (children.length === 0) return;
        const title = `Orphaned Family ${parentId.slice(0, 8)}`;
        families.push({
            familyId: `orphaned:${parentId}`,
            parent: null,
            children,
            nodes: children,
            title,
            kind: "jobs.orphaned",
            tool: children[0]?.tool || "jobs",
            worldId: children[0]?.worldId ?? null,
            status: rankStatus(children.map((child) => child.status)),
            progress: aggregateFamilyProgress(null, children),
            currentStage: fallbackStage(null, children),
            updatedAt: Math.max(...children.map((child) => child.updatedAt)),
            modalities: collectModalities(null, children),
            isOrphaned: true,
            timeline: buildTimeline(null, children),
        });
    });

    return families.sort((left, right) => right.updatedAt - left.updatedAt);
}
