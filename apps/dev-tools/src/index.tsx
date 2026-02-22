import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./App";
import { WorldGenPage } from "./worldgeneration";

const router = createBrowserRouter([
    { path: "/", element: <App /> },
    { path: "/worldgen", element: <WorldGenPage /> },
]);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <RouterProvider router={router} />
    </StrictMode>
);
