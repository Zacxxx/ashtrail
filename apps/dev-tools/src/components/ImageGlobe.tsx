import { useEffect, useRef } from "react";
import * as THREE from "three";

interface ImageGlobeProps {
    textureUrl: string;
    showHexGrid?: boolean;
}

export function ImageGlobe({ textureUrl, showHexGrid = false }: ImageGlobeProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#050b14");

        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.set(0, 0, 3.2);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
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

        const atmosphere = new THREE.Mesh(
            new THREE.SphereGeometry(1.025, 64, 64),
            new THREE.MeshBasicMaterial({ color: 0x76a9ff, transparent: true, opacity: 0.08 })
        );
        scene.add(atmosphere);

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
        let targetZoom = camera.position.z;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const zoomSpeed = 0.15;
            const delta = e.deltaY > 0 ? zoomSpeed : -zoomSpeed;
            targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom + delta));
        };

        // Drag Rotation
        let dragging = false;
        let lastX = 0;
        let lastY = 0;

        const onDown = (e: PointerEvent) => {
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            (e.target as Element).setPointerCapture?.(e.pointerId);
        };

        const onMove = (e: PointerEvent) => {
            if (dragging) {
                const dx = e.clientX - lastX;
                const dy = e.clientY - lastY;
                lastX = e.clientX;
                lastY = e.clientY;
                globe.rotation.y += dx * 0.005;
                globe.rotation.x += dy * 0.003;
                globe.rotation.x = Math.max(-1.2, Math.min(1.2, globe.rotation.x));
                atmosphere.rotation.copy(globe.rotation);
                hexGridGroup.rotation.copy(globe.rotation);
            }
        };

        const onUp = () => { dragging = false; };
        const onLeave = () => { dragging = false; };

        renderer.domElement.addEventListener("pointerdown", onDown);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        renderer.domElement.addEventListener("pointerleave", onLeave);
        renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
        window.addEventListener("resize", resize);

        let raf = 0;
        const tick = () => {
            const currentZ = camera.position.z;
            const lerpFactor = 0.08;
            if (Math.abs(currentZ - targetZoom) > 0.001) {
                camera.position.z = currentZ + (targetZoom - currentZ) * lerpFactor;
            }

            if (!dragging) {
                globe.rotation.y += 0.0008;
                atmosphere.rotation.copy(globe.rotation);
                hexGridGroup.rotation.copy(globe.rotation);
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
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
            scene.clear();
        };
    }, [textureUrl, showHexGrid]);

    return (
        <div
            ref={containerRef}
            className="w-full h-full"
        />
    );
}
