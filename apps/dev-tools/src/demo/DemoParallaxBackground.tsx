import type { CSSProperties } from "react";
import { useParallaxMotion } from "./useParallaxMotion";

const GRAIN_TEXTURE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.85'/%3E%3C/svg%3E")`;

interface DemoParallaxBackgroundProps {
    imageUrl: string;
    className?: string;
}

function layerStyle(
    imageUrl: string,
    transform: string,
    extra?: CSSProperties,
): CSSProperties {
    return {
        backgroundImage: `url("${imageUrl}")`,
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        transform,
        willChange: "transform",
        ...extra,
    };
}

export function DemoParallaxBackground({ imageUrl, className = "" }: DemoParallaxBackgroundProps) {
    const rootRef = useParallaxMotion();

    const sharedLayer = "pointer-events-none absolute inset-0";
    const atmosphereMask = "linear-gradient(to bottom, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.88) 36%, rgba(0,0,0,0.36) 62%, transparent 86%)";
    const towerMask = "radial-gradient(26% 56% at 63% 31%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.94) 44%, rgba(0,0,0,0.46) 70%, transparent 100%)";
    const pathMask = "radial-gradient(34% 24% at 50% 76%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 42%, rgba(0,0,0,0.36) 70%, transparent 100%)";
    const leftForegroundMask = "radial-gradient(18% 72% at 10% 57%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 44%, transparent 88%)";
    const rightForegroundMask = "radial-gradient(22% 60% at 91% 69%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.94) 40%, transparent 86%)";
    const bottomForegroundMask = "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.92) 16%, rgba(0,0,0,0.48) 28%, transparent 52%)";

    return (
        <div
            ref={rootRef}
            aria-hidden="true"
            className={`absolute inset-0 overflow-hidden [--parallax-x:0] [--parallax-y:0] [--drift-x:0] [--drift-y:0] ${className}`}
        >
            <img
                src={imageUrl}
                alt=""
                loading="eager"
                decoding="async"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.88]"
            />

            <div
                className={`${sharedLayer} opacity-18`}
                style={layerStyle(imageUrl, "translate3d(0, 0, 0) scale(1.015)")}
            />

            <div className={`${sharedLayer} bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.10),_transparent_48%),linear-gradient(180deg,rgba(7,10,14,0.04)_0%,rgba(7,10,14,0.12)_48%,rgba(7,10,14,0.26)_100%)]`} />

            <div
                className={`${sharedLayer} opacity-20 saturate-[0.98]`}
                style={layerStyle(
                    imageUrl,
                    "translate3d(calc((var(--parallax-x) + var(--drift-x)) * -8px), calc((var(--parallax-y) + var(--drift-y)) * -6px), 0) scale(1.03)",
                    {
                        WebkitMaskImage: atmosphereMask,
                        maskImage: atmosphereMask,
                    },
                )}
            />

            <div
                className={`${sharedLayer} opacity-34 contrast-[1.04] saturate-[1.03]`}
                style={layerStyle(
                    imageUrl,
                    "translate3d(calc((var(--parallax-x) + var(--drift-x)) * -16px), calc((var(--parallax-y) + var(--drift-y)) * -12px), 0) scale(1.05)",
                    {
                        WebkitMaskImage: towerMask,
                        maskImage: towerMask,
                    },
                )}
            />

            <div
                className={`${sharedLayer} opacity-30 saturate-[1.04]`}
                style={layerStyle(
                    imageUrl,
                    "translate3d(calc((var(--parallax-x) + var(--drift-x)) * -22px), calc((var(--parallax-y) + var(--drift-y)) * -16px), 0) scale(1.055)",
                    {
                        WebkitMaskImage: pathMask,
                        maskImage: pathMask,
                        filter: "sepia(0.05) saturate(1.04)",
                    },
                )}
            />

            <div
                className={`${sharedLayer} opacity-44 contrast-[1.04] saturate-[1.06]`}
                style={layerStyle(
                    imageUrl,
                    "translate3d(calc((var(--parallax-x) + var(--drift-x)) * -32px), calc((var(--parallax-y) + var(--drift-y)) * -20px), 0) scale(1.07)",
                    {
                        WebkitMaskImage: leftForegroundMask,
                        maskImage: leftForegroundMask,
                        filter: "brightness(0.88) saturate(1.1)",
                    },
                )}
            />

            <div
                className={`${sharedLayer} opacity-42 contrast-[1.03] saturate-[1.04]`}
                style={layerStyle(
                    imageUrl,
                    "translate3d(calc((var(--parallax-x) + var(--drift-x)) * -30px), calc((var(--parallax-y) + var(--drift-y)) * -18px), 0) scale(1.068)",
                    {
                        WebkitMaskImage: rightForegroundMask,
                        maskImage: rightForegroundMask,
                        filter: "brightness(0.9) saturate(1.08)",
                    },
                )}
            />

            <div
                className={`${sharedLayer} opacity-28`}
                style={layerStyle(
                    imageUrl,
                    "translate3d(calc((var(--parallax-x) + var(--drift-x)) * -26px), calc((var(--parallax-y) + var(--drift-y)) * -14px), 0) scale(1.05)",
                    {
                        WebkitMaskImage: bottomForegroundMask,
                        maskImage: bottomForegroundMask,
                        filter: "brightness(0.92) saturate(1.02)",
                    },
                )}
            />

            <div className={`${sharedLayer} bg-[radial-gradient(circle_at_50%_34%,rgba(255,248,232,0.05),transparent_28%),linear-gradient(180deg,transparent_0%,transparent_56%,rgba(173,121,64,0.06)_100%)]`} />

            <div
                className={`${sharedLayer} mix-blend-soft-light opacity-[0.08]`}
                style={{
                    backgroundImage: `${GRAIN_TEXTURE}, linear-gradient(180deg, rgba(255,244,214,0.04) 0%, rgba(123,88,52,0.08) 100%)`,
                    backgroundRepeat: "repeat, no-repeat",
                    backgroundSize: "220px 220px, cover",
                    transform: "translate3d(calc(var(--drift-x) * 18px), calc(var(--drift-y) * 14px), 0) scale(1.03)",
                    willChange: "transform",
                }}
            />

            <div className={`${sharedLayer} bg-[radial-gradient(circle_at_center,transparent_58%,rgba(5,7,10,0.08)_86%,rgba(5,7,10,0.18)_100%)]`} />
            <div className={`${sharedLayer} bg-[linear-gradient(180deg,rgba(3,4,6,0.08)_0%,transparent_22%,transparent_70%,rgba(3,4,6,0.28)_100%)]`} />
        </div>
    );
}
