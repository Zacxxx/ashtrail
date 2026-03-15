import { useEffect, useRef } from "react";
import * as THREE from "three";

export type ImageGlobeCameraPreset = "stepOneShowcase" | "stepTwoIntro" | "stepTwoReady";

interface ImageGlobeProps {
    textureUrl: string;
    showHexGrid?: boolean;
    transparentBackground?: boolean;
    cameraPreset?: ImageGlobeCameraPreset;
    interactive?: boolean;
}

const CAMERA_PRESETS: Record<ImageGlobeCameraPreset, { position: [number, number, number]; lookAt: [number, number, number] }> = {
    stepOneShowcase: {
        position: [0, 0.02, 3.2],
        lookAt: [0.62, 0.03, 0],
    },
    stepTwoIntro: {
        position: [0, -0.04, 2.84],
        lookAt: [-0.54, 0, 0],
    },
    stepTwoReady: {
        position: [0, 0.02, 4.35],
        lookAt: [0.34, 0.01, 0],
    },
};

export function ImageGlobe({
    textureUrl,
    showHexGrid = false,
    transparentBackground = false,
    cameraPreset = "stepOneShowcase",
    interactive = true,
}: ImageGlobeProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const globeRef = useRef<THREE.Mesh | null>(null);
    const atmosphereRef = useRef<THREE.Mesh | null>(null);
    const hexGridGroupRef = useRef<THREE.Group | null>(null);
    const targetCameraPositionRef = useRef(new THREE.Vector3());
    const targetLookAtRef = useRef(new THREE.Vector3());
    const currentLookAtRef = useRef(new THREE.Vector3());
    const presetDepthRef = useRef(CAMERA_PRESETS[cameraPreset].position[2]);
    const zoomOffsetRef = useRef(0);
    const draggingRef = useRef(false);
    const interactiveRef = useRef(interactive);
    const lastPointerRef = useRef({ x: 0, y: 0 });

    const syncOverlayRotations = () => {
        const globe = globeRef.current;
        const atmosphere = atmosphereRef.current;
        const hexGridGroup = hexGridGroupRef.current;
        if (!globe || !atmosphere || !hexGridGroup) {
            return;
        }
        atmosphere.rotation.copy(globe.rotation);
        hexGridGroup.rotation.copy(globe.rotation);
    };

    const setCameraPreset = (presetName: ImageGlobeCameraPreset, snap = false) => {
        const preset = CAMERA_PRESETS[presetName];
        presetDepthRef.current = preset.position[2];
        zoomOffsetRef.current = 0;
        targetCameraPositionRef.current.set(...preset.position);
        targetLookAtRef.current.set(...preset.lookAt);

        if (snap && cameraRef.current) {
            cameraRef.current.position.set(...preset.position);
            currentLookAtRef.current.set(...preset.lookAt);
            cameraRef.current.lookAt(currentLookAtRef.current);
        }
    };

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const scene = new THREE.Scene();
        scene.background = transparentBackground ? null : new THREE.Color("#050b14");

        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        cameraRef.current = camera;
        setCameraPreset(cameraPreset, true);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: transparentBackground });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearAlpha(transparentBackground ? 0 : 1);
        container.appendChild(renderer.domElement);

        const ambient = new THREE.AmbientLight(0xffffff, 0.35);
        scene.add(ambient);

        const key = new THREE.DirectionalLight(0xffffff, 1.0);
        key.position.set(4, 2, 4);
        scene.add(key);

        const rim = new THREE.DirectionalLight(0x6aa9ff, 0.45);
        rim.position.set(-3, -1.5, -2.5);
        scene.add(rim);

        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load(textureUrl);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;

        const globe = new THREE.Mesh(
            new THREE.SphereGeometry(1, 256, 256), // High-res sphere
            new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0.0 })
        );
        scene.add(globe);
        globeRef.current = globe;

        const atmosphere = new THREE.Mesh(
            new THREE.SphereGeometry(1.025, 64, 64),
            new THREE.MeshBasicMaterial({ color: 0x76a9ff, transparent: true, opacity: 0.08 })
        );
        scene.add(atmosphere);
        atmosphereRef.current = atmosphere;

        // Optional Hex Grid Overlay
        const hexGridGroup = new THREE.Group();
        if (showHexGrid) {
            const hexGeo = new THREE.IcosahedronGeometry(1.002, 10);
            const hexMat = new THREE.MeshBasicMaterial({
                color: 0xa855f7, // purple-500
                wireframe: true,
                transparent: true,
                opacity: 0.15
            });
            const hexMesh = new THREE.Mesh(hexGeo, hexMat);
            hexGridGroup.add(hexMesh);
        }
        scene.add(hexGridGroup);
        hexGridGroupRef.current = hexGridGroup;

        // Stars
        const stars = new THREE.Group();
        const starGeo = new THREE.SphereGeometry(0.01, 6, 6);
        const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        for (let i = 0; i < 450; i++) {
            const s = new THREE.Mesh(starGeo, starMat);
            const r = 10 + Math.random() * 18;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            s.position.set(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.cos(phi),
                r * Math.sin(phi) * Math.sin(theta)
            );
            stars.add(s);
        }
        scene.add(stars);

        const resize = () => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            renderer.setSize(w, h);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };
        resize();

        // Mouse Wheel Zoom
        const MIN_ZOOM = 1.5;
        const MAX_ZOOM = 6.0;

        const onWheel = (e: WheelEvent) => {
            if (!interactiveRef.current) {
                return;
            }
            e.preventDefault();
            const zoomSpeed = 0.15;
            const delta = e.deltaY > 0 ? zoomSpeed : -zoomSpeed;
            const minimumOffset = MIN_ZOOM - presetDepthRef.current;
            const maximumOffset = MAX_ZOOM - presetDepthRef.current;
            zoomOffsetRef.current = Math.max(minimumOffset, Math.min(maximumOffset, zoomOffsetRef.current + delta));
            targetCameraPositionRef.current.z = presetDepthRef.current + zoomOffsetRef.current;
        };

        // Drag Rotation
        const onDown = (e: PointerEvent) => {
            if (!interactiveRef.current) {
                return;
            }
            draggingRef.current = true;
            lastPointerRef.current = { x: e.clientX, y: e.clientY };
            (e.target as Element).setPointerCapture?.(e.pointerId);
        };

        const onMove = (e: PointerEvent) => {
            const globeMesh = globeRef.current;
            if (draggingRef.current && globeMesh) {
                const dx = e.clientX - lastPointerRef.current.x;
                const dy = e.clientY - lastPointerRef.current.y;
                lastPointerRef.current = { x: e.clientX, y: e.clientY };
                globeMesh.rotation.y += dx * 0.005;
                globeMesh.rotation.x += dy * 0.003;
                globeMesh.rotation.x = Math.max(-1.2, Math.min(1.2, globeMesh.rotation.x));
                syncOverlayRotations();
            }
        };

        const onUp = () => {
            draggingRef.current = false;
        };
        const onLeave = () => {
            draggingRef.current = false;
        };

        renderer.domElement.addEventListener("pointerdown", onDown);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        renderer.domElement.addEventListener("pointerleave", onLeave);
        renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
        window.addEventListener("resize", resize);

        let raf = 0;
        const tick = () => {
            camera.position.lerp(targetCameraPositionRef.current, 0.06);
            currentLookAtRef.current.lerp(targetLookAtRef.current, 0.06);
            camera.lookAt(currentLookAtRef.current);

            if (!draggingRef.current && globeRef.current) {
                globeRef.current.rotation.y += 0.0008;
                syncOverlayRotations();
            }
            renderer.render(scene, camera);
            raf = requestAnimationFrame(tick);
        };
        tick();

        return () => {
            cancelAnimationFrame(raf);
            renderer.domElement.removeEventListener("pointerdown", onDown);
            renderer.domElement.removeEventListener("pointerleave", onLeave);
            renderer.domElement.removeEventListener("wheel", onWheel);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("resize", resize);
            texture.dispose();
            renderer.dispose();
            cameraRef.current = null;
            globeRef.current = null;
            atmosphereRef.current = null;
            hexGridGroupRef.current = null;
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
            scene.clear();
        };
    }, [showHexGrid, textureUrl, transparentBackground]);

    useEffect(() => {
        interactiveRef.current = interactive;
        if (!interactive) {
            draggingRef.current = false;
        }
    }, [interactive]);

    useEffect(() => {
        if (!cameraRef.current) {
            return;
        }
        setCameraPreset(cameraPreset);
    }, [cameraPreset]);

    return (
        <div
            ref={containerRef}
            className="w-full h-full"
        />
    );
}
