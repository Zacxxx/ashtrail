import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from "react-router-dom";
import { App } from "./App";
import { RootLayout } from "./components/RootLayout";
import { WorldGenPage } from "./worldgeneration";
import { AssetGeneratorPage } from "./assetgen";
import { GalleryPage } from "./gallery";
import { GameplayEnginePage } from "./gameplay-engine";
import { CharacterBuilderPage } from "./character-builder";
import { HistoryPage } from "./history";
import { EcologyPage } from "./ecology";
import { GameMasterPage } from "./game-master";
import { QuestPage } from "./quests";
import { StoryLoopPage } from "./story-loop";
import { DemoLandingPage } from "./demo/DemoLandingPage";
import {
    DEMO_ALIAS_ROUTE,
    DEMO_ROUTE,
    DEVTOOLS_BASE,
    LEGACY_DEVTOOLS_REDIRECTS,
} from "./lib/routes";

function LegacyRedirect({ to }: { to: string }) {
    const location = useLocation();
    return <Navigate replace to={`${to}${location.search}`} />;
}

const router = createBrowserRouter([
    {
        path: DEMO_ROUTE,
        element: <DemoLandingPage />,
    },
    {
        path: DEMO_ALIAS_ROUTE,
        element: <DemoLandingPage />,
    },
    {
        path: DEVTOOLS_BASE,
        element: <RootLayout />,
        children: [
            { index: true, element: <App /> },
            { path: "worldgen", element: <WorldGenPage /> },
            { path: "asset-generator", element: <AssetGeneratorPage /> },
            { path: "game-master", element: <GameMasterPage /> },
            { path: "gallery", element: <GalleryPage /> },
            { path: "gameplay-engine", element: <GameplayEnginePage /> },
            { path: "character-builder", element: <CharacterBuilderPage /> },
            { path: "history", element: <HistoryPage /> },
            { path: "ecology", element: <EcologyPage /> },
            { path: "quests", element: <QuestPage /> },
            { path: "story-loop", element: <StoryLoopPage /> },
        ],
    },
    ...Object.entries(LEGACY_DEVTOOLS_REDIRECTS).map(([path, to]) => ({
        path,
        element: <LegacyRedirect to={to} />,
    })),
]);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <RouterProvider router={router} />
    </StrictMode>
);
