import { useEffect } from "react";

let sharedSceneAudio: HTMLAudioElement | null = null;
let sharedSceneAudioUrl: string | null = null;
let sharedPlaybackAttempt: Promise<boolean> | null = null;
let sharedUnlockBound = false;
let sharedUnlockHandler: (() => void) | null = null;
let sharedActiveSessions = 0;
let sharedPauseTimer: number | null = null;

function ensureSceneAudio(url: string) {
    if (!sharedSceneAudio || sharedSceneAudioUrl !== url) {
        if (sharedSceneAudio) {
            sharedSceneAudio.pause();
            sharedSceneAudio.src = "";
        }
        sharedSceneAudio = new Audio(url);
        sharedSceneAudio.crossOrigin = "anonymous";
        sharedSceneAudio.preload = "auto";
        sharedSceneAudio.loop = true;
        sharedSceneAudio.volume = 0.58;
        sharedSceneAudioUrl = url;
    }
    return sharedSceneAudio;
}

function clearScenePauseTimer() {
    if (sharedPauseTimer === null || typeof window === "undefined") return;
    window.clearTimeout(sharedPauseTimer);
    sharedPauseTimer = null;
}

function unbindSceneUnlock() {
    if (!sharedUnlockBound || !sharedUnlockHandler || typeof window === "undefined") return;
    window.removeEventListener("pointerdown", sharedUnlockHandler);
    window.removeEventListener("keydown", sharedUnlockHandler);
    window.removeEventListener("touchstart", sharedUnlockHandler);
    sharedUnlockHandler = null;
    sharedUnlockBound = false;
}

function scheduleScenePause(audio: HTMLAudioElement) {
    if (typeof window === "undefined") {
        audio.pause();
        unbindSceneUnlock();
        return;
    }

    clearScenePauseTimer();
    sharedPauseTimer = window.setTimeout(() => {
        sharedPauseTimer = null;
        if (sharedActiveSessions > 0) return;
        audio.pause();
        unbindSceneUnlock();
    }, 0);
}

async function startScenePlayback(url: string) {
    const audio = ensureSceneAudio(url);
    if (!audio.paused) {
        return true;
    }

    if (sharedPlaybackAttempt) return sharedPlaybackAttempt;

    sharedPlaybackAttempt = (async () => {
        try {
            await audio.play();
            return true;
        } catch {
            return false;
        } finally {
            sharedPlaybackAttempt = null;
        }
    })();

    return sharedPlaybackAttempt;
}

function bindSceneUnlock(url: string) {
    if (sharedUnlockBound || typeof window === "undefined") return;
    sharedUnlockBound = true;

    const handleUnlock = async () => {
        const started = await startScenePlayback(url);
        if (!started) return;
        unbindSceneUnlock();
    };

    sharedUnlockHandler = handleUnlock;
    window.addEventListener("pointerdown", handleUnlock, { passive: true });
    window.addEventListener("keydown", handleUnlock);
    window.addEventListener("touchstart", handleUnlock, { passive: true });
}

export function useSceneAudio(url: string | null, active: boolean) {
    useEffect(() => {
        if (!active || !url) return;

        const audio = ensureSceneAudio(url);
        let cancelled = false;

        const tryPlay = async () => {
            const started = await startScenePlayback(url);
            if (cancelled) return;
            if (started) {
                unbindSceneUnlock();
            } else {
                bindSceneUnlock(url);
            }
        };

        sharedActiveSessions += 1;
        clearScenePauseTimer();
        void tryPlay();

        return () => {
            cancelled = true;
            sharedActiveSessions = Math.max(0, sharedActiveSessions - 1);
            scheduleScenePause(audio);
        };
    }, [active, url]);
}
