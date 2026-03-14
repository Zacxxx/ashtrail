import { useEffect, useState } from "react";
import { HOME_AUDIO_URL } from "./assets";

type AudioState = "loading" | "playing" | "blocked";

let sharedAudio: HTMLAudioElement | null = null;
let primed = false;
let unlockBound = false;
let unlockHandler: (() => void) | null = null;
const listeners = new Set<(state: AudioState) => void>();

function emit(state: AudioState) {
    listeners.forEach((listener) => listener(state));
}

function ensureAudio() {
    if (sharedAudio) return sharedAudio;

    sharedAudio = new Audio(HOME_AUDIO_URL);
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

async function startPlayback() {
    const audio = primeAudio();

    try {
        await audio.play();
        emit("playing");
        return true;
    } catch {
        emit("blocked");
        return false;
    }
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
            sharedAudio?.pause();
            unbindUnlock();
            return;
        }

        let cancelled = false;
        setAudioState("loading");

        primeAudio();

        const handleCanPlay = () => {
            if (cancelled) return;
            void startPlayback().then((started) => {
                if (!started) bindUnlock();
            });
        };

        const audio = ensureAudio();
        if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
            handleCanPlay();
        } else {
            audio.addEventListener("canplaythrough", handleCanPlay, { once: true });
            audio.addEventListener("loadeddata", handleCanPlay, { once: true });
        }

        return () => {
            cancelled = true;
            audio.pause();
            unbindUnlock();
            audio.removeEventListener("canplaythrough", handleCanPlay);
            audio.removeEventListener("loadeddata", handleCanPlay);
        };
    }, [active]);

    return audioState;
}
