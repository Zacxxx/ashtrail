import { useEffect } from "react";

export function useSceneAudio(url: string | null, active: boolean) {
    useEffect(() => {
        if (!active || !url) return;

        const audio = new Audio(url);
        audio.crossOrigin = "anonymous";
        audio.preload = "auto";
        audio.loop = true;
        audio.volume = 0.58;

        let cancelled = false;

        const tryPlay = async () => {
            try {
                await audio.play();
                detachUnlock();
            } catch {
                attachUnlock();
            }
        };

        const handleUnlock = () => {
            if (cancelled) return;
            void tryPlay();
        };

        const attachUnlock = () => {
            window.addEventListener("pointerdown", handleUnlock, { passive: true });
            window.addEventListener("keydown", handleUnlock);
            window.addEventListener("touchstart", handleUnlock, { passive: true });
        };

        const detachUnlock = () => {
            window.removeEventListener("pointerdown", handleUnlock);
            window.removeEventListener("keydown", handleUnlock);
            window.removeEventListener("touchstart", handleUnlock);
        };

        void tryPlay();

        return () => {
            cancelled = true;
            detachUnlock();
            audio.pause();
            audio.src = "";
        };
    }, [active, url]);
}
