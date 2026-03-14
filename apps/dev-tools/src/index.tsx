import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
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

const router = createBrowserRouter([
    {
        path: "/",
        element: <RootLayout />,
        children: [
            { path: "/", element: <App /> },
            { path: "/worldgen", element: <WorldGenPage /> },
            { path: "/asset-generator", element: <AssetGeneratorPage /> },
            { path: "/game-master", element: <GameMasterPage /> },
            { path: "/gallery", element: <GalleryPage /> },
            { path: "/gameplay-engine", element: <GameplayEnginePage /> },
            { path: "/character-builder", element: <CharacterBuilderPage /> },
            { path: "/history", element: <HistoryPage /> },
            { path: "/ecology", element: <EcologyPage /> },
            { path: "/quests", element: <QuestPage /> },
            { path: "/story-loop", element: <StoryLoopPage /> },
        ]
    },
]);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <RouterProvider router={router} />
    </StrictMode>
);
