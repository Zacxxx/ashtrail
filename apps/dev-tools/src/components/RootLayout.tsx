import { Outlet } from "react-router-dom";
import { GlobalHeader } from "./GlobalHeader";

export function RootLayout() {
    return (
        <div className="min-h-screen bg-[#070b12] text-gray-300 font-sans">
            <GlobalHeader />
            <main>
                <Outlet />
            </main>
        </div>
    );
}
