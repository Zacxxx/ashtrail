import { Outlet } from "react-router-dom";
import { JobsProvider } from "../jobs/JobsProvider";

export function AppProviders() {
    return (
        <JobsProvider>
            <Outlet />
        </JobsProvider>
    );
}
