import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./App";
import { WorldGenPage } from "./worldgeneration";
import { IconGenPage } from "./icongen";
import { TravelPage } from "./travel";
import { GalleryPage } from "./gallery";
import { GameplayEnginePage } from "./gameplay-engine";

const router = createBrowserRouter([
    { path: "/", element: <App /> },
    { path: "/worldgen", element: <WorldGenPage /> },
    { path: "/icon-generation", element: <IconGenPage /> },
    { path: "/travel", element: <TravelPage /> },
    { path: "/gallery", element: <GalleryPage /> },
    { path: "/gameplay-engine", element: <GameplayEnginePage /> },
]);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <RouterProvider router={router} />
    </StrictMode>
);
