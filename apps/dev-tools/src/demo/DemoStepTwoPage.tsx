import { ScreenShell } from "@ashtrail/ui";
import { useHomepageAudio } from "./useHomepageAudio";

export function DemoStepTwoPage() {
    useHomepageAudio(false);

    return (
        <ScreenShell variant="technical">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.10),_transparent_24%),linear-gradient(180deg,#04070b_0%,#0a1118_50%,#03050a_100%)]" />
            <div className="relative z-10 flex h-full w-full items-center justify-center px-6 text-center">
                <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.45em] text-cyan-200">Demo Step 2</div>
                    <h1 className="mt-6 text-5xl font-black uppercase tracking-[0.18em] text-white">Reserved</h1>
                    <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-gray-300 md:text-lg">
                        This route is intentionally in place as the next handoff after the interleaved walkthrough.
                        The real step 2 experience will land here next.
                    </p>
                </div>
            </div>
        </ScreenShell>
    );
}
