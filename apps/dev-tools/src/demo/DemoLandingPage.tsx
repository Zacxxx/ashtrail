import { Button, Container, ScreenShell, Stack } from "@ashtrail/ui";
import { HOME_IMAGE_URL } from "./assets";
import { useHomepageAudio } from "./useHomepageAudio";

export function DemoLandingPage() {
    const audioState = useHomepageAudio(true);

    const launch = () => {
        alert("SYSTEM_INITIALIZING: Application launch sequence engaged.");
    };

    return (
        <ScreenShell>
            <img
                src={HOME_IMAGE_URL}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-60"
            />

            <Container centered className="relative z-10 flex flex-col items-center gap-24 text-center">
                <Stack gap={4} className="animate-in fade-in slide-in-from-top-4 duration-1000">
                    <h1 className="mono scale-y-110 text-[10vw] font-black italic uppercase leading-none tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                        ASHTRAIL
                    </h1>
                </Stack>

                <Stack gap={6} className="w-[480px] animate-in fade-in slide-in-from-bottom-4 items-center duration-1000 delay-300">
                    <Button
                        size="lg"
                        variant="glass"
                        onClick={launch}
                        className="group relative w-full overflow-hidden rounded bg-white/[0.03] px-0 py-12 text-3xl font-black tracking-[1.4em] transition-all duration-1000 hover:bg-white/[0.08]"
                    >
                        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-1000 group-hover:opacity-100">
                            <div className="absolute -bottom-1/2 left-1/2 h-0 w-[140%] -translate-x-1/2 rounded-[45%] bg-white/[0.12] blur-[80px] transition-all duration-[1800ms] ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:h-[200%]" />
                            <div className="absolute top-1/2 left-1/4 h-32 w-32 rounded-full bg-white/20 blur-[40px] transition-all duration-[2000ms] group-hover:-translate-y-24 group-hover:scale-150 animate-pulse" />
                            <div className="absolute top-1/2 right-1/4 h-40 w-40 rounded-full bg-white/10 blur-[60px] transition-all duration-[2500ms] group-hover:-translate-y-32 group-hover:scale-125 animate-pulse delay-500" />
                            <div className="absolute top-[80%] left-[20%] h-1 w-1 rounded-full bg-white blur-[1px] transition-all duration-[1200ms] group-hover:-translate-y-40 group-hover:opacity-0" />
                            <div className="absolute top-[90%] left-[60%] h-1.5 w-1.5 rounded-full bg-white blur-[2px] transition-all delay-200 duration-[1500ms] group-hover:-translate-y-48 group-hover:opacity-0" />
                            <div className="absolute top-[85%] left-[80%] h-1 w-1 rounded-full bg-white blur-[1px] transition-all delay-400 duration-[1000ms] group-hover:-translate-y-32 group-hover:opacity-0" />
                        </div>

                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0 scale-150 rounded-full bg-white/5 opacity-0 blur-3xl transition-all duration-[1500ms] ease-out group-hover:h-full group-hover:opacity-100" />
                        <div className="absolute inset-x-0 top-0 h-px scale-x-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 ease-out group-hover:scale-x-100" />

                        <span className="relative z-10 flex translate-x-[0.7em] items-center justify-center drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all duration-1000 group-hover:scale-105 group-hover:text-white">
                            LAUNCH
                        </span>
                    </Button>
                </Stack>

                <div className="mt-8 opacity-40">
                    <div className="mx-auto h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
                </div>
            </Container>
        </ScreenShell>
    );
}
