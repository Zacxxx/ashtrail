import { useEffect, useState } from "react";
import { HOME_AUDIO_URL } from "./assets";

type AudioState = "loading" | "playing" | "blocked";

let sharedAudio: HTMLAudioElement | null = null;
let primed = false;
let unlockBound = false;
let unlockHandler: (() => void) | null = null;
let playbackAttempt: Promise<boolean> | null = null;
let activeSessions = 0;
let pauseTimer: number | null = null;
const listeners = new Set<(state: AudioState) => void>();

function emit(state: AudioState) {
    listeners.forEach((listener) => listener(state));
}

function ensureAudio() {
    if (sharedAudio) return sharedAudio;

    sharedAudio = new Audio(HOME_AUDIO_URL);
    sharedAudio.crossOrigin = "anonymous";
    sharedAudio.preload = "auto";
    sharedAudio.loop = true;
    sharedAudio.volume = 0.55;
    return sharedAudio;
}

function primeAudio() {
    const audio = ensureAudio();
    if (!primed) {
        primed = true;
        audio.load();
    }
    return audio;
}

function clearPauseTimer() {
    if (pauseTimer === null || typeof window === "undefined") return;
    window.clearTimeout(pauseTimer);
    pauseTimer = null;
}

function schedulePause(audio: HTMLAudioElement) {
    if (typeof window === "undefined") {
        audio.pause();
        unbindUnlock();
        return;
    }

    clearPauseTimer();
    pauseTimer = window.setTimeout(() => {
        pauseTimer = null;
        if (activeSessions > 0) return;
        audio.pause();
        unbindUnlock();
    }, 0);
}

async function startPlayback() {
    const audio = primeAudio();
    if (!audio.paused) {
        emit("playing");
        return true;
    }

    if (playbackAttempt) return playbackAttempt;

    playbackAttempt = (async () => {
        try {
            await audio.play();
            emit("playing");
            return true;
        } catch {
            emit("blocked");
            return false;
        } finally {
            playbackAttempt = null;
        }
    })();

    return playbackAttempt;
}

function bindUnlock() {
    if (unlockBound || typeof window === "undefined") return;
    unlockBound = true;

    const attemptUnlock = async () => {
        const started = await startPlayback();
        if (!started) return;

        unbindUnlock();
    };

    unlockHandler = attemptUnlock;

    window.addEventListener("pointerdown", attemptUnlock, { passive: true });
    window.addEventListener("keydown", attemptUnlock);
    window.addEventListener("touchstart", attemptUnlock, { passive: true });
}

function unbindUnlock() {
    if (!unlockBound || !unlockHandler || typeof window === "undefined") return;

    window.removeEventListener("pointerdown", unlockHandler);
    window.removeEventListener("keydown", unlockHandler);
    window.removeEventListener("touchstart", unlockHandler);
    unlockHandler = null;
    unlockBound = false;
}

export function useHomepageAudio(active: boolean) {
    const [audioState, setAudioState] = useState<AudioState>("loading");

    useEffect(() => {
        listeners.add(setAudioState);
        return () => {
            listeners.delete(setAudioState);
        };
    }, []);

    useEffect(() => {
        if (!active) {
            if (sharedAudio) schedulePause(sharedAudio);
            return;
        }

        let cancelled = false;
        activeSessions += 1;
        clearPauseTimer();
        setAudioState("loading");

        const audio = primeAudio();

        const tryStartPlayback = () => {
            if (cancelled) return;
            void startPlayback().then((started) => {
                if (!started) bindUnlock();
            });
        };

        const handleCanPlay = () => {
            if (cancelled) return;
            tryStartPlayback();
        };

        const handlePlaying = () => {
            if (cancelled) return;
            emit("playing");
        };

        const handleBuffering = () => {
            if (cancelled || audio.paused) return;
            emit("loading");
        };

        if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            tryStartPlayback();
        }

        audio.addEventListener("playing", handlePlaying);
        audio.addEventListener("waiting", handleBuffering);
        audio.addEventListener("stalled", handleBuffering);
        audio.addEventListener("canplay", handleCanPlay);

        // Start playback as soon as the browser has the first playable chunk,
        // then let the native byte-range buffer continue filling during playback.
        tryStartPlayback();

        return () => {
            cancelled = true;
            activeSessions = Math.max(0, activeSessions - 1);
            schedulePause(audio);
            audio.removeEventListener("playing", handlePlaying);
            audio.removeEventListener("waiting", handleBuffering);
            audio.removeEventListener("stalled", handleBuffering);
            audio.removeEventListener("canplay", handleCanPlay);
        };
    }, [active]);

    return audioState;
}

if (typeof window !== "undefined") {
    const path = window.location.pathname;
    if (path === "/" || path === "/demo") {
        primeAudio();
    }
}
