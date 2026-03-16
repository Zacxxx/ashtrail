import { useEffect, useMemo, useRef, useState } from "react";
import type { GeneratedMediaNarrationSegment } from "./generatedMediaVideo";

interface SyncedNarratedVideoPlayerProps {
    videoUrl: string;
    posterUrl?: string | null;
    durationSeconds?: number;
    segments?: GeneratedMediaNarrationSegment[];
    keepVideoAudioDefault?: boolean;
    className?: string;
}

export function SyncedNarratedVideoPlayer({
    videoUrl,
    posterUrl,
    durationSeconds,
    segments = [],
    keepVideoAudioDefault = true,
    className = "",
}: SyncedNarratedVideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const timersRef = useRef<number[]>([]);
    const activeAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
    const activeCutoffsRef = useRef<Map<string, number>>(new Map());
    const [narrationEnabled, setNarrationEnabled] = useState(true);
    const [videoAudioEnabled, setVideoAudioEnabled] = useState(keepVideoAudioDefault);
    const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

    const sortedSegments = useMemo(
        () => [...segments].sort((left, right) => left.startMs - right.startMs),
        [segments],
    );

    const clearTimers = () => {
        for (const timer of timersRef.current) {
            window.clearTimeout(timer);
        }
        timersRef.current = [];
    };

    const resetVideoVolume = () => {
        const video = videoRef.current;
        if (!video) return;
        video.volume = videoAudioEnabled ? 0.6 : 0;
        video.muted = !videoAudioEnabled;
    };

    const stopActiveAudios = () => {
        for (const timer of activeCutoffsRef.current.values()) {
            window.clearTimeout(timer);
        }
        activeCutoffsRef.current.clear();
        for (const audio of activeAudiosRef.current.values()) {
            audio.pause();
            audio.currentTime = 0;
        }
        activeAudiosRef.current.clear();
        setActiveSegmentId(null);
        resetVideoVolume();
    };

    const playSegment = (segment: GeneratedMediaNarrationSegment, currentMs: number) => {
        if (!narrationEnabled) return;
        const video = videoRef.current;
        if (!video) return;
        const audio = new Audio(segment.audioUrl);
        audio.preload = "auto";
        audio.volume = 1;
        const offsetSeconds = Math.max(0, (currentMs - segment.startMs) / 1000);
        if (offsetSeconds > 0) {
            audio.currentTime = offsetSeconds;
        }
        activeAudiosRef.current.set(segment.segmentId, audio);
        setActiveSegmentId(segment.segmentId);
        video.volume = videoAudioEnabled ? segment.duckVideoTo : 0;
        video.muted = !videoAudioEnabled;
        let cleanedUp = false;
        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            const cutoffTimer = activeCutoffsRef.current.get(segment.segmentId);
            if (cutoffTimer !== undefined) {
                window.clearTimeout(cutoffTimer);
                activeCutoffsRef.current.delete(segment.segmentId);
            }
            activeAudiosRef.current.delete(segment.segmentId);
            if (activeAudiosRef.current.size === 0) {
                setActiveSegmentId(null);
                resetVideoVolume();
            }
        };
        audio.addEventListener("ended", cleanup, { once: true });
        audio.addEventListener("pause", cleanup, { once: true });
        const remainingMs = Math.max(150, segment.endMs - Math.max(segment.startMs, currentMs));
        const cutoffTimer = window.setTimeout(() => {
            audio.pause();
            audio.currentTime = 0;
        }, remainingMs);
        activeCutoffsRef.current.set(segment.segmentId, cutoffTimer);
        void audio.play().catch(() => {
            cleanup();
        });
    };

    const scheduleNarration = () => {
        clearTimers();
        stopActiveAudios();
        const video = videoRef.current;
        if (!video || video.paused || !narrationEnabled) {
            resetVideoVolume();
            return;
        }
        const currentMs = video.currentTime * 1000;
        for (const segment of sortedSegments) {
            if (segment.endMs <= currentMs) continue;
            const delay = Math.max(0, segment.startMs - currentMs);
            const timer = window.setTimeout(() => playSegment(segment, video.currentTime * 1000), delay);
            timersRef.current.push(timer);
        }
    };

    useEffect(() => {
        resetVideoVolume();
    }, [videoAudioEnabled]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handlePlay = () => scheduleNarration();
        const handlePause = () => {
            clearTimers();
            stopActiveAudios();
        };
        const handleSeeked = () => scheduleNarration();
        const handleRateChange = () => scheduleNarration();
        const handleEnded = () => {
            clearTimers();
            stopActiveAudios();
        };

        video.addEventListener("play", handlePlay);
        video.addEventListener("pause", handlePause);
        video.addEventListener("seeked", handleSeeked);
        video.addEventListener("ratechange", handleRateChange);
        video.addEventListener("ended", handleEnded);

        return () => {
            video.removeEventListener("play", handlePlay);
            video.removeEventListener("pause", handlePause);
            video.removeEventListener("seeked", handleSeeked);
            video.removeEventListener("ratechange", handleRateChange);
            video.removeEventListener("ended", handleEnded);
            clearTimers();
            stopActiveAudios();
        };
    }, [narrationEnabled, sortedSegments, videoAudioEnabled]);

    const handleRestartSync = () => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = 0;
        if (!video.paused) {
            scheduleNarration();
        }
    };

    return (
        <div className={`space-y-4 ${className}`}>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                <video
                    ref={videoRef}
                    controls
                    preload="metadata"
                    poster={posterUrl || undefined}
                    className="aspect-video w-full bg-black object-contain"
                >
                    <source src={videoUrl} type="video/mp4" />
                </video>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => setNarrationEnabled((current) => !current)}
                    className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${narrationEnabled ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-white/5 text-gray-400"}`}
                >
                    Narrator {narrationEnabled ? "on" : "off"}
                </button>
                <button
                    type="button"
                    onClick={() => setVideoAudioEnabled((current) => !current)}
                    className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${videoAudioEnabled ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" : "border-white/10 bg-white/5 text-gray-400"}`}
                >
                    Video audio {videoAudioEnabled ? "on" : "off"}
                </button>
                <button
                    type="button"
                    onClick={handleRestartSync}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-gray-300"
                >
                    Restart sync
                </button>
                {typeof durationSeconds === "number" && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-gray-400">
                        {durationSeconds}s
                    </span>
                )}
            </div>
            {!!sortedSegments.length && (
                <div className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Narration timeline</div>
                    {sortedSegments.map((segment) => (
                        <div
                            key={segment.segmentId}
                            className={`rounded-xl border px-3 py-2 text-sm ${activeSegmentId === segment.segmentId ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-50" : "border-white/8 bg-white/5 text-gray-300"}`}
                        >
                            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">
                                {(segment.startMs / 1000).toFixed(1)}s {"->"} {(segment.endMs / 1000).toFixed(1)}s
                            </div>
                            <p className="mt-1 leading-5">{segment.text}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
