import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssetGeneratorPage } from "./AssetGeneratorPage";

vi.mock("../hooks/useActiveWorld", () => ({
    useActiveWorld: () => ({ activeWorldId: null }),
}));

vi.mock("../ecology/useEcologyData", () => ({
    useEcologyData: () => ({
        bundle: null,
        saveBundle: vi.fn(async () => undefined),
    }),
}));

vi.mock("../jobs/useJobs", () => ({
    useJobs: () => ({
        jobs: [],
        getJobDetail: vi.fn(async () => null),
        waitForJob: vi.fn(async () => null),
    }),
}));

vi.mock("../jobs/useTrackedJobLauncher", () => ({
    useTrackedJobLauncher: () => vi.fn(),
}));

vi.mock("@ashtrail/core", () => ({
    GameRegistry: {
        getAllTraits: () => [],
        getAllOccupations: () => [],
        getAllItems: () => [],
        getAllSkills: () => [],
        getAllCharacters: () => [],
        fetchFromBackend: vi.fn(async () => undefined),
    },
}));

describe("AssetGeneratorPage songs", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (
                url.includes("/api/icons/batches")
                || url.includes("/api/textures/batches")
                || url.includes("/api/sprites/batches")
                || url.includes("/api/songs/batches")
                || url.includes("/api/packs")
            ) {
                return new Response(JSON.stringify([]), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            return new Response(JSON.stringify({}), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }));
    });

    it("opens the songs tab from query params and renders song controls", async () => {
        render(
            <MemoryRouter initialEntries={["/devtools/asset-generator?tab=songs"]}>
                <Routes>
                    <Route path="/devtools/asset-generator" element={<AssetGeneratorPage />} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByText("MEDIA AUDIO CONFIG")).toBeInTheDocument();
        });

        expect(screen.getByText("Gemini 3 Interleaved Demo")).toBeInTheDocument();
        expect(screen.getByText("Sound Brief")).toBeInTheDocument();
        expect(screen.getByText("Duration")).toBeInTheDocument();
    });
});
