import { createContext, useContext } from "react";
import type { LocationMarker } from "../components/ImageGlobe";

export type DemoPlanetView =
    | "hidden"
    | "stepOneShowcase"
    | "stepTwoIntro"
    | "stepTwoReady"
    | "stepThreeIntro"
    | "stepThreeSelect";

type DemoFlowContextValue = {
    setPlanetAsset: (asset: { textureUrl?: string | null; title?: string | null }) => void;
    setPlanetView: (view: DemoPlanetView) => void;
    setLocationMarkers: (markers: LocationMarker[]) => void;
};

export const DemoFlowContext = createContext<DemoFlowContextValue | null>(null);

export function useDemoFlow() {
    const value = useContext(DemoFlowContext);
    if (!value) {
        throw new Error("useDemoFlow must be used within DemoFlowPage.");
    }
    return value;
}
