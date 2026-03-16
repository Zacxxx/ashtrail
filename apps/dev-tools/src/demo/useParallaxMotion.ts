import { useEffect, useRef } from "react";

const EASING = 0.075;
const IDLE_X_AMPLITUDE = 0.14;
const IDLE_Y_AMPLITUDE = 0.1;

export function useParallaxMotion() {
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const node = rootRef.current;
        if (!node) return;

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const finePointer = window.matchMedia("(pointer: fine)");

        const target = { x: 0, y: 0 };
        const current = { x: 0, y: 0 };
        let isMounted = true;
        let rafId = 0;

        const update = (timestamp: number) => {
            if (!isMounted) return;

            const motionEnabled = !reduceMotion.matches;
            const pointerEnabled = motionEnabled && finePointer.matches;

            const idleX = motionEnabled ? Math.sin(timestamp / 4200) * IDLE_X_AMPLITUDE : 0;
            const idleY = motionEnabled ? Math.cos(timestamp / 5100) * IDLE_Y_AMPLITUDE : 0;
            const goalX = pointerEnabled ? target.x : 0;
            const goalY = pointerEnabled ? target.y : 0;

            current.x += (goalX - current.x) * EASING;
            current.y += (goalY - current.y) * EASING;

            node.style.setProperty("--parallax-x", current.x.toFixed(4));
            node.style.setProperty("--parallax-y", current.y.toFixed(4));
            node.style.setProperty("--drift-x", idleX.toFixed(4));
            node.style.setProperty("--drift-y", idleY.toFixed(4));

            rafId = window.requestAnimationFrame(update);
        };

        const handlePointerMove = (event: PointerEvent) => {
            if (reduceMotion.matches || !finePointer.matches) return;
            target.x = ((event.clientX / window.innerWidth) - 0.5) * 2;
            target.y = ((event.clientY / window.innerHeight) - 0.5) * 2;
        };

        const handlePointerLeave = () => {
            target.x = 0;
            target.y = 0;
        };

        window.addEventListener("pointermove", handlePointerMove, { passive: true });
        window.addEventListener("pointerleave", handlePointerLeave);
        window.addEventListener("blur", handlePointerLeave);

        rafId = window.requestAnimationFrame(update);

        return () => {
            isMounted = false;
            window.cancelAnimationFrame(rafId);
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerleave", handlePointerLeave);
            window.removeEventListener("blur", handlePointerLeave);
        };
    }, []);

    return rootRef;
}
