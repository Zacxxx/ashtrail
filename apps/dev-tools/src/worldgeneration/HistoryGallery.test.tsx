import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryGallery } from "./HistoryGallery";

vi.mock("../jobs/useJobs", () => ({
    useJobs: () => ({ jobs: [] }),
}));

describe("HistoryGallery songs", () => {
    beforeEach(() => {
        Object.defineProperty(HTMLMediaElement.prototype, "load", {
            configurable: true,
            value: vi.fn(),
        });
    });

    it("renders song inventory cards in the songs tab", () => {
        const { container } = render(
            <HistoryGallery
                history={[]}
                activePlanetId={null}
                deleteFromHistory={vi.fn()}
                onSelectPlanet={vi.fn()}
                onSelectTexture={vi.fn()}
                showExtendedTabs={true}
                initialTab="songs"
                inventory={{
                    warnings: [],
                    supabase: { configured: true, reachable: true },
                    tabs: {
                        planets: [],
                        textures: [],
                        icons: [],
                        characters: [],
                        isolated: [],
                        sprites: [],
                        songs: [{
                            id: "song-1",
                            type: "song",
                            title: "Dust Watch",
                            category: "ambience",
                            displayUrl: "/api/songs/batch-1/000_v01.wav",
                            localUrl: "/api/songs/batch-1/000_v01.wav",
                            cloudPublicUrl: null,
                            storageKey: "ashtrail/songs/batch-1/000_v01.wav",
                            source: "hybrid",
                            syncState: "synced",
                            createdAt: "2026-03-14T10:00:00Z",
                            worldId: null,
                            metadata: {
                                batchId: "batch-1",
                                batchName: "Dust Watch",
                                prompt: "wind over abandoned overpass",
                                negativePrompt: "no vocals",
                                variantIndex: 1,
                                durationSeconds: 32.8,
                                sampleRateHz: 48000,
                            },
                        }],
                        packs: [],
                    },
                }}
            />,
        );

        expect(screen.getByRole("button", { name: "Songs" })).toBeInTheDocument();
        expect(screen.getByText("Dust Watch")).toBeInTheDocument();
        expect(screen.getByText(/wind over abandoned overpass/i)).toBeInTheDocument();
        expect(screen.getByText(/synced/i)).toBeInTheDocument();
        expect(container.querySelector("audio")).not.toBeNull();
    });
});
