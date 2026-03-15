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
                        videos: [],
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

    it("renders video inventory cards in the videos tab", () => {
        const { container } = render(
            <HistoryGallery
                history={[]}
                activePlanetId={null}
                deleteFromHistory={vi.fn()}
                onSelectPlanet={vi.fn()}
                onSelectTexture={vi.fn()}
                showExtendedTabs={true}
                initialTab="videos"
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
                        songs: [],
                        videos: [{
                            id: "video-1",
                            type: "video",
                            title: "Ashfall Raid",
                            category: "cinematic",
                            displayUrl: "/api/videos/batch-1/poster.png",
                            localUrl: "/api/videos/batch-1/video.mp4",
                            cloudPublicUrl: null,
                            storageKey: "ashtrail/videos/batch-1/video.mp4",
                            source: "hybrid",
                            syncState: "synced",
                            createdAt: "2026-03-15T10:00:00Z",
                            worldId: null,
                            metadata: {
                                batchId: "batch-1",
                                batchName: "Ashfall Raid",
                                videoUrl: "/api/videos/batch-1/video.mp4",
                                posterUrl: "/api/videos/batch-1/poster.png",
                                durationSeconds: 8,
                                narrationLanguage: "fr-FR",
                                voiceName: "Charon",
                                keepVeoAudio: true,
                                script: "La nuit tombe sur le raid.",
                                segments: [{
                                    segmentId: "seg-001",
                                    startMs: 0,
                                    endMs: 2200,
                                    text: "La nuit tombe sur le raid.",
                                    audioUrl: "/api/videos/batch-1/narration/seg_001.wav",
                                    mimeType: "audio/wav",
                                    duckVideoTo: 0.3,
                                }],
                            },
                        }],
                        packs: [],
                    },
                }}
            />,
        );

        expect(screen.getByRole("button", { name: "Videos" })).toBeInTheDocument();
        expect(screen.getByText("Ashfall Raid")).toBeInTheDocument();
        expect(screen.getAllByText(/La nuit tombe sur le raid/i).length).toBeGreaterThan(0);
        expect(container.querySelector("video")).not.toBeNull();
    });
});
