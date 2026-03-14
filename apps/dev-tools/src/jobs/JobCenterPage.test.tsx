import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobCenterPage } from "./JobCenterPage";
import type { JobDetail, JobListItem } from "./types";

const mockUseGenerationHistory = vi.fn();
const mockUseJobs = vi.fn();

vi.mock("../hooks/useGenerationHistory", () => ({
    useGenerationHistory: () => mockUseGenerationHistory(),
}));

vi.mock("./useJobs", () => ({
    useJobs: () => mockUseJobs(),
}));

beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: vi.fn(),
    });
});

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

describe("JobCenterPage", () => {
    it("selects the family targeted by jobId query params", async () => {
        const parent = makeJob({
            jobId: "parent-1",
            title: "Interleaved Session",
            status: "running",
            progress: 60,
            currentStage: "Directing scene",
        });
        const child = makeJob({
            jobId: "child-1",
            parentJobId: "parent-1",
            title: "Generate Illustration",
            kind: "quests.generate-illustration",
            metadata: { childKind: "image-beat", segmentTitle: "Dust storm reveal" },
            status: "completed",
            progress: 100,
            currentStage: "Completed",
            outputRefs: [{ id: "preview", label: "Preview", kind: "text", previewText: "done" }],
        });

        mockUseGenerationHistory.mockReturnValue({
            history: [{ id: "world-1", name: "Ashtrail Prime", prompt: "Ashtrail Prime" }],
        });
        mockUseJobs.mockReturnValue({
            jobs: [parent, child],
            cancelJob: vi.fn(),
            openOutput: vi.fn(),
            redoJob: vi.fn(),
            getJobDetail: vi.fn(async (jobId: string) => ({ ...(jobId === child.jobId ? child : parent) } as JobDetail)),
            refreshJobs: vi.fn(async () => undefined),
        });

        render(
            <MemoryRouter initialEntries={["/devtools/jobcenter?jobId=child-1"]}>
                <Routes>
                    <Route path="/devtools/jobcenter" element={<JobCenterPage />} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "Interleaved Session" })).toBeInTheDocument();
        });
        expect(screen.getByText(/Selected job:/)).toHaveTextContent("Generate Illustration");
        expect(screen.getAllByText("Dust storm reveal").length).toBeGreaterThan(0);
        expect(screen.getAllByText("image").length).toBeGreaterThan(0);
    });

    it("opens the tools tab from query params and renders technical and product categories", async () => {
        const exploration = makeJob({
            jobId: "exploration-1",
            tool: "exploration",
            title: "Explore Basin",
            kind: "exploration.scene.generate",
            status: "running",
            updatedAt: 10,
        });
        const quests = makeJob({
            jobId: "quest-1",
            tool: "quests",
            title: "Generate Quest",
            kind: "quests.generate-run.v2",
            status: "completed",
            updatedAt: 20,
        });

        mockUseGenerationHistory.mockReturnValue({ history: [] });
        mockUseJobs.mockReturnValue({
            jobs: [exploration, quests],
            cancelJob: vi.fn(),
            openOutput: vi.fn(),
            redoJob: vi.fn(),
            getJobDetail: vi.fn(async (jobId: string) => ({ ...(jobId === quests.jobId ? quests : exploration) } as JobDetail)),
            refreshJobs: vi.fn(async () => undefined),
        });

        render(
            <MemoryRouter initialEntries={["/devtools/jobcenter?tab=tools&tool=exploration"]}>
                <Routes>
                    <Route path="/devtools/jobcenter" element={<JobCenterPage />} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByRole("tab", { name: "Tools" })).toHaveAttribute("aria-selected", "true");
        });

        expect(screen.getByText("By Technical Category")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Switch to product categories" })).toBeInTheDocument();
        expect(screen.getAllByText(/Technical:/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Product:/).length).toBeGreaterThan(0);
        expect(screen.getByText("Available")).toBeInTheDocument();
    });

    it("switches tool grouping with the chevron toggle", async () => {
        const exploration = makeJob({
            jobId: "exploration-1",
            tool: "exploration",
            title: "Explore Basin",
            kind: "exploration.scene.generate",
            status: "running",
            updatedAt: 10,
        });

        mockUseGenerationHistory.mockReturnValue({ history: [] });
        mockUseJobs.mockReturnValue({
            jobs: [exploration],
            cancelJob: vi.fn(),
            openOutput: vi.fn(),
            redoJob: vi.fn(),
            getJobDetail: vi.fn(async () => ({ ...exploration } as JobDetail)),
            refreshJobs: vi.fn(async () => undefined),
        });

        render(
            <MemoryRouter initialEntries={["/devtools/jobcenter?tab=tools"]}>
                <Routes>
                    <Route path="/devtools/jobcenter" element={<JobCenterPage />} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByText("By Technical Category")).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: "Switch to product categories" }));

        await waitFor(() => {
            expect(screen.getByText("By Product Category")).toBeInTheDocument();
        });
        expect(screen.getByRole("button", { name: "Switch to technical categories" })).toBeInTheDocument();
    });

    it("switches back to overview with a tool filter from the tools tab", async () => {
        const exploration = makeJob({
            jobId: "exploration-1",
            tool: "exploration",
            title: "Explore Basin",
            kind: "exploration.scene.generate",
            status: "running",
            updatedAt: 10,
        });
        const worldgen = makeJob({
            jobId: "world-1",
            tool: "worldgen",
            title: "Generate World",
            kind: "worldgen.locations.generate",
            status: "completed",
            updatedAt: 20,
        });

        mockUseGenerationHistory.mockReturnValue({ history: [] });
        mockUseJobs.mockReturnValue({
            jobs: [exploration, worldgen],
            cancelJob: vi.fn(),
            openOutput: vi.fn(),
            redoJob: vi.fn(),
            getJobDetail: vi.fn(async (jobId: string) => ({ ...(jobId === worldgen.jobId ? worldgen : exploration) } as JobDetail)),
            refreshJobs: vi.fn(async () => undefined),
        });

        render(
            <MemoryRouter initialEntries={["/devtools/jobcenter?tab=tools&tool=exploration"]}>
                <Routes>
                    <Route path="/devtools/jobcenter" element={<JobCenterPage />} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByRole("tab", { name: "Tools" })).toHaveAttribute("aria-selected", "true");
        });

        fireEvent.click(within(screen.getAllByRole("article").find((node) => within(node).queryByText("Exploration"))!).getByRole("button", { name: "View jobs" }));

        await waitFor(() => {
            expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
        });
        expect(screen.getByRole("combobox", { name: "Tool" })).toHaveValue("exploration");
        expect(screen.getByText("1 visible families")).toBeInTheDocument();
    });

    it("renders generated media audio artifacts in job detail", async () => {
        const mediaJob = makeJob({
            jobId: "media-1",
            tool: "generatemedia.audio",
            title: "Generate Media Audio",
            kind: "interleaved.generatemedia.audio.v1",
            status: "completed",
            progress: 100,
            currentStage: "Completed",
            outputRefs: [{ id: "summary", label: "Gemini Final Response", kind: "text", previewText: "done" }],
            metadata: { modality: "mixed" },
            updatedAt: 50,
        });

        mockUseGenerationHistory.mockReturnValue({ history: [] });
        mockUseJobs.mockReturnValue({
            jobs: [mediaJob],
            cancelJob: vi.fn(),
            openOutput: vi.fn(),
            redoJob: vi.fn(),
            getJobDetail: vi.fn(async () => ({
                ...mediaJob,
                result: {
                    artifact: {
                        type: "generated_media_audio",
                        status: "success",
                        audio: {
                            url: "/api/generated-media/media-1/audio.wav",
                            durationSeconds: 18,
                            mimeType: "audio/wav",
                        },
                        image: {
                            url: "/api/generated-media/media-1/image.png",
                            mimeType: "image/png",
                        },
                        metadata: {
                            title: "Dust Relay",
                            description: "A tense audio cue for refinery traversal.",
                            intent: "scene support",
                            tags: ["ambience", "ost"],
                        },
                        warnings: [],
                    },
                    transcript: {
                        model: "gemini-3-flash-preview",
                        logicalToolName: "generatemedia.audio",
                        apiToolName: "generatemedia_audio",
                        toolCalled: true,
                        thoughtSignatureDetected: true,
                        finalResponseText: "Dust Relay supports traversal under pressure.",
                    },
                },
            } as JobDetail)),
            refreshJobs: vi.fn(async () => undefined),
        });

        render(
            <MemoryRouter initialEntries={["/devtools/jobcenter?jobId=media-1"]}>
                <Routes>
                    <Route path="/devtools/jobcenter" element={<JobCenterPage />} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByText("Generated Media Artifact")).toBeInTheDocument();
        });

        expect(screen.getByText("Dust Relay")).toBeInTheDocument();
        expect(screen.getByText(/A tense audio cue/i)).toBeInTheDocument();
        expect(screen.getAllByText("generatemedia.audio").length).toBeGreaterThan(0);
        expect(screen.getByText(/Dust Relay supports traversal under pressure/i)).toBeInTheDocument();
    });
});
