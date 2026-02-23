import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./App";
import { WorldGenPage } from "./worldgeneration";
import { IconGenPage } from "./icongen";

const router = createBrowserRouter([
    { path: "/", element: <App /> },
    { path: "/worldgen", element: <WorldGenPage /> },
    { path: "/icon-generation", element: <IconGenPage /> },
]);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <RouterProvider router={router} />
    </StrictMode>
);
