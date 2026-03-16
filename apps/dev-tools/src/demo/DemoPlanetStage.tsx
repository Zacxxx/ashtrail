import type { CSSProperties } from "react";
import { ImageGlobe, type ImageGlobeCameraPreset, type LocationMarker } from "../components/ImageGlobe";
import type { DemoPlanetView } from "./DemoFlowContext";

interface DemoPlanetStageProps {
    textureUrl: string | null;
    view: DemoPlanetView;
    locationMarkers?: LocationMarker[];
}

type PlanetStageViewConfig = {
    cameraPreset: ImageGlobeCameraPreset;
    interactive: boolean;
    autoRotate: boolean;
    wrapperClassName: string;
    glowClassName: string;
    maskStyle?: CSSProperties;
};

const VIEW_CONFIG: Record<Exclude<DemoPlanetView, "hidden">, PlanetStageViewConfig> = {
    stepOneShowcase: {
        cameraPreset: "stepOneShowcase",
        interactive: true,
        autoRotate: true,
        wrapperClassName: "opacity-100 saturate-[1.08]",
        glowClassName: "opacity-100",
        maskStyle: {
            WebkitMaskImage: "linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 54%, rgba(0,0,0,0.5) 72%, rgba(0,0,0,0) 88%)",
            maskImage: "linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 54%, rgba(0,0,0,0.5) 72%, rgba(0,0,0,0) 88%)",
        },
    },
    stepTwoIntro: {
        cameraPreset: "stepTwoIntro",
        interactive: false,
        autoRotate: true,
        wrapperClassName: "opacity-[0.96] saturate-110 brightness-[1.04]",
        glowClassName: "opacity-[0.9]",
    },
    stepTwoReady: {
        cameraPreset: "stepTwoReady",
        interactive: false,
        autoRotate: true,
        wrapperClassName: "opacity-[0.2] saturate-[0.95] brightness-[0.9]",
        glowClassName: "opacity-[0.45]",
        maskStyle: {
            WebkitMaskImage: "linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.92) 56%, rgba(0,0,0,0.36) 74%, rgba(0,0,0,0) 92%)",
            maskImage: "linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.92) 56%, rgba(0,0,0,0.36) 74%, rgba(0,0,0,0) 92%)",
        },
    },
    stepThreeIntro: {
        cameraPreset: "stepThreeIntro",
        interactive: false,
        autoRotate: true,
        wrapperClassName: "opacity-[0.98] saturate-110 brightness-[1.02]",
        glowClassName: "opacity-[0.92]",
    },
    stepThreeSelect: {
        cameraPreset: "stepThreeSelect",
        interactive: false,
        autoRotate: false,
        wrapperClassName: "opacity-[0.95] saturate-[1.04] brightness-[1.02]",
        glowClassName: "opacity-[0.86]",
    },
};

export function DemoPlanetStage({ textureUrl, view, locationMarkers = [] }: DemoPlanetStageProps) {
    if (!textureUrl || view === "hidden") {
        return null;
    }

    const config = VIEW_CONFIG[view];

    return (
        <div className="pointer-events-none absolute inset-0 z-[4] overflow-hidden">
            <div
                className={`absolute inset-0 transition-[opacity,filter] duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${config.wrapperClassName}`}
                style={config.maskStyle}
            >
                <div className={`absolute inset-0 transition-opacity duration-[1200ms] ${config.glowClassName}`}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_26%_36%,rgba(96,165,250,0.12),transparent_22%),radial-gradient(circle_at_72%_48%,rgba(56,189,248,0.08),transparent_24%)] blur-3xl" />
                </div>
                <div className={`absolute inset-0 ${config.interactive ? "pointer-events-auto" : ""}`}>
                    <ImageGlobe
                        textureUrl={textureUrl}
                        transparentBackground
                        cameraPreset={config.cameraPreset}
                        interactive={config.interactive}
                        autoRotate={config.autoRotate}
                        locationMarkers={locationMarkers}
                    />
                </div>
            </div>
        </div>
    );
}
