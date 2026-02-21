import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./App";
import { WorldGenPage } from "./WorldGenPage";
import { NewWorldGenPage } from "./NewWorldGenPage";

const router = createBrowserRouter([
    { path: "/", element: <App /> },
    { path: "/legacy-worldgen", element: <WorldGenPage /> },
    { path: "/new-worldgen", element: <NewWorldGenPage /> },
]);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <RouterProvider router={router} />
    </StrictMode>
);
