import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { LocationGenerationMetadata, WorldLocation } from "../history/locationTypes";
import type {
    GenerationProgress,
    HumanityReadiness,
    HumanityTerminalState,
    WorldgenRegionRecord,
} from "./types";
import { HumanityPanel } from "./HumanityPanel";

function makeMetadata(totalLocations: number, viableProvinceCount: number): LocationGenerationMetadata {
    return {
        worldId: "world-1",
        config: {
            prompt: "prompt",
            settlementDensity: 0.6,
            techLevel: 0.4,
            scopeMode: "scoped",
            scopeTargets: [{ kind: "kingdom", id: 10 }],
            resolvedProvinceIds: [105],
            generatedAt: 1,
        },
        coverage: {
            totalLocations,
            settlementCount: totalLocations,
            nonSettlementCount: 0,
            viableProvinceCount,
            coveredViableProvinceCount: totalLocations > 0 ? viableProvinceCount : 0,
        },
        countsByCategory: {},
        countsBySubtype: {},
        uncoveredProvinceIds: [],
        deterministicSeedHash: "seed",
        aiDetailPass: {
            status: "disabled",
            attemptedBatches: 0,
            successfulBatches: 0,
            refinedLocations: 0,
            totalLocations,
        },
    };
}

function renderPanel(options?: {
    terminalState?: HumanityTerminalState | null;
    metadata?: LocationGenerationMetadata | null;
    locations?: WorldLocation[];
    genProgress?: Partial<GenerationProgress>;
}) {
    const readiness: HumanityReadiness = {
        ready: true,
        blockers: [],
        mainLoreChars: 300,
        minMainLoreChars: 250,
        hasMainLore: true,
    };
    const regions: WorldgenRegionRecord[] = [];
    const genProgress: GenerationProgress = {
        isActive: false,
        progress: 100,
        stage: "Locations ready",
        jobId: null,
        ...options?.genProgress,
    };

    return render(
        <MemoryRouter>
            <HumanityPanel
                humPrompt="prompt"
                setHumPrompt={vi.fn()}
                humSettlements={0.6}
                setHumSettlements={vi.fn()}
                humTech={0.4}
                setHumTech={vi.fn()}
                generateHumanity={vi.fn()}
                genProgress={genProgress}
                globeWorld={{ cols: 4, rows: 4, cellData: [], textureUrl: "/planet.png" }}
                readiness={readiness}
                scopeKind="world"
                setScopeKind={vi.fn()}
                scopeTargets={[]}
                visibleRegions={regions}
                scopeQuery=""
                setScopeQuery={vi.fn()}
                resolvedProvinceCount={1}
                onToggleScopeTarget={vi.fn()}
                onAdoptExistingOutput={vi.fn()}
                isAdoptingExistingOutput={false}
                regions={regions}
                locations={options?.locations ?? []}
                metadata={options?.metadata ?? null}
                terminalState={options?.terminalState ?? null}
                selectedLocationId={null}
                onSelectLocation={vi.fn()}
            />
        </MemoryRouter>,
    );
}

describe("HumanityPanel terminal feedback", () => {
    it("shows a failure banner when the last humanity run failed", () => {
        renderPanel({
            terminalState: {
                status: "failed",
                message: "Humanity input mismatch: province_id.png does not match provinces.json for the selected scope.",
            },
        });

        expect(screen.getByText("Last Humanity Run Failed")).toBeInTheDocument();
        expect(screen.getByText(/province_id\.png does not match provinces\.json/i)).toBeInTheDocument();
    });

    it("shows an empty-result banner when humanity completes without locations", () => {
        renderPanel({
            terminalState: { status: "success", message: "Locations ready" },
            metadata: makeMetadata(0, 0),
        });

        expect(screen.getByText("Humanity Completed With No Locations")).toBeInTheDocument();
        expect(screen.getByText(/none of its provinces are currently viable/i)).toBeInTheDocument();
    });

    it("does not show a success banner when terminal metadata is missing", () => {
        renderPanel({
            terminalState: { status: "success", message: "Locations ready" },
            metadata: null,
        });

        expect(screen.queryByText("Humanity Completed With No Locations")).not.toBeInTheDocument();
        expect(screen.queryByText("Last Humanity Run Succeeded")).not.toBeInTheDocument();
    });
});
