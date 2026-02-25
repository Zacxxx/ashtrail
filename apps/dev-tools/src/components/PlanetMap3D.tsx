import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { TerrainCell } from "../modules/geo/types";
import { type PlanetWorldData } from "../modules/planet/tiles";

interface PlanetMap3DProps {
    world: PlanetWorldData;
    onCellHover?: (cell: TerrainCell | null) => void;
    onCellClick?: (cell: TerrainCell | null) => void;
    showHexGrid?: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function makeTexture(world: PlanetWorldData): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = world.cols;
    canvas.height = world.rows;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Failed to create texture canvas context");
    }

    const image = ctx.createImageData(world.cols, world.rows);
    const data = image.data;

    for (let y = 0; y < world.rows; y++) {
        for (let x = 0; x < world.cols; x++) {
            const idx = y * world.cols + x;
            const p = idx * 4;
            const [r, g, b] = hexToRgb(world.cellData[idx]?.color ?? "#000000");
            data[p] = r;
            data[p + 1] = g;
            data[p + 2] = b;
            data[p + 3] = 255;
        }
    }

    ctx.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
}

export function PlanetMap3D({ world, onCellHover, onCellClick }: PlanetMap3DProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#050b14");

        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        // Position camera so it looks at the map like a table
        camera.position.set(0, -1.8, 1.8);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.appendChild(renderer.domElement);

        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambient);

        const key = new THREE.DirectionalLight(0xffffff, 1.0);
        key.position.set(2, -4, 4);
        scene.add(key);

        const rim = new THREE.DirectionalLight(0x6aa9ff, 0.5);
        rim.position.set(-2, 4, 1);
        scene.add(rim);

        // ── Heightmap generation from color texture ──
        function generateHeightmapFromImage(image: HTMLImageElement | HTMLCanvasElement): THREE.CanvasTexture {
            const w = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
            const h = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d")!;
            // Draw vertically flipped since Three.js planes have flipped UVs occasionally depending on mapping,
            // but let's stick to standard and flip after if needed.
            ctx.drawImage(image, 0, 0, w, h);
            const imageData = ctx.getImageData(0, 0, w, h);
            const src = imageData.data;

            const rawElevations = new Float32Array(w * h);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = (y * w + x) * 4;
                    const r = src[i] / 255;
                    const g = src[i + 1] / 255;
                    const b = src[i + 2] / 255;
                    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                    let elevation: number;

                    const isWater = b > r * 1.15 && b > g * 1.05 && luminance < 0.55;
                    if (isWater) {
                        elevation = 0.1 + luminance * 0.15;
                    } else {
                        const greenness = g - Math.max(r, b);
                        if (greenness > 0.05) {
                            // Plains / Forests
                            elevation = 0.2 + luminance * 0.2;
                        } else if (luminance > 0.7) {
                            // Ice / Snow
                            elevation = 0.35 + (luminance - 0.7) * 0.4;
                        } else {
                            // Deserts / Mountains
                            elevation = 0.25 + luminance * 0.25;
                        }
                    }
                    rawElevations[y * w + x] = elevation;
                }
            }

            // Write the raw unblurred elevations back to the canvas
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const elevation = rawElevations[y * w + x];
                    const v = Math.min(255, Math.max(0, Math.round(elevation * 255)));
                    const i = (y * w + x) * 4;
                    src[i] = v;
                    src[i + 1] = v;
                    src[i + 2] = v;
                    src[i + 3] = 255;
                }
            }
            ctx.putImageData(imageData, 0, 0);

            // Create offscreen canvas for hardware-accelerated large radius blur
            const blurCanvas = document.createElement("canvas");
            blurCanvas.width = w;
            blurCanvas.height = h;
            const bctx = blurCanvas.getContext("2d")!;
            bctx.filter = "blur(12px)";
            bctx.drawImage(canvas, 0, 0);

            const tex = new THREE.CanvasTexture(blurCanvas);
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.needsUpdate = true;
            return tex;
        }

        let mapMaterial: THREE.MeshStandardMaterial;

        if (world.textureUrl) {
            const loader = new THREE.TextureLoader();
            loader.setCrossOrigin("anonymous");
            const texture = loader.load(world.textureUrl, (loadedTex) => {
                if (world.heightmapUrl) {
                    // Load actual generated 16-bit heightmap
                    loader.load(world.heightmapUrl, (heightTex) => {
                        heightTex.colorSpace = THREE.LinearSRGBColorSpace;
                        mapMaterial.displacementMap = heightTex;
                        mapMaterial.displacementScale = 0.4; // Exaggerate true topo slightly
                        mapMaterial.bumpMap = heightTex;
                        mapMaterial.bumpScale = 0.05;
                        mapMaterial.needsUpdate = true;
                    });
                } else {
                    // Fallback to color heuristic
                    try {
                        const heightmap = generateHeightmapFromImage(loadedTex.image);
                        mapMaterial.displacementMap = heightmap;
                        mapMaterial.displacementScale = 0.08;
                        mapMaterial.bumpMap = heightmap;
                        mapMaterial.bumpScale = 0.04;
                        mapMaterial.needsUpdate = true;
                    } catch (e) {
                        console.warn("Failed to generate heightmap due to CORS or tainted canvas:", e);
                    }
                }
            });
            texture.colorSpace = THREE.SRGBColorSpace;
            mapMaterial = new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.9,
                metalness: 0.0,
                side: THREE.DoubleSide
            });
        } else {
            const texture = makeTexture(world);
            texture.colorSpace = THREE.SRGBColorSpace;
            // We flip the texture if it's generated internally
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;

            mapMaterial = new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.9,
                metalness: 0.0,
                side: THREE.DoubleSide
            });
        }

        // A flat plane mapped with the texture, and displaced via the material.
        // 2:1 aspect ratio plane
        const planeGeo = new THREE.PlaneGeometry(3, 1.5, 512, 256);
        const plane = new THREE.Mesh(planeGeo, mapMaterial);

        scene.add(plane);

        const resize = () => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            renderer.setSize(w, h);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };
        resize();

        // ── Mouse Wheel Zoom ──
        const MIN_ZOOM = 0.3;
        const MAX_ZOOM = 4.0;
        let targetZoom = camera.position.z;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const zoomSpeed = 0.15;
            const delta = e.deltaY > 0 ? zoomSpeed : -zoomSpeed;
            targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom + delta));
        };

        // ── Drag Map ──
        let dragging = false;
        let isRightClick = false;
        let lastX = 0;
        let lastY = 0;

        const onDown = (e: PointerEvent) => {
            dragging = true;
            isRightClick = e.button === 2;
            lastX = e.clientX;
            lastY = e.clientY;
            (e.target as Element).setPointerCapture?.(e.pointerId);
        };

        const onMove = (e: PointerEvent) => {
            if (dragging) {
                const dx = e.clientX - lastX;
                const dy = e.clientY - lastY;

                if (isRightClick || e.shiftKey) { // Rotate
                    plane.rotation.z -= dx * 0.005;
                    plane.rotation.x -= dy * 0.005;
                    plane.rotation.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, plane.rotation.x));
                } else { // Pan
                    // Fast planar panning adjustment relative to zoom
                    const panSpeed = 0.002 * camera.position.z;
                    camera.position.x -= dx * panSpeed;
                    camera.position.y += dy * panSpeed;
                }

                lastX = e.clientX;
                lastY = e.clientY;
            }
        };

        const onUp = () => {
            dragging = false;
            isRightClick = false;
        };

        const onContextMenu = (e: Event) => e.preventDefault();

        renderer.domElement.addEventListener("pointerdown", onDown);
        renderer.domElement.addEventListener("pointermove", onMove);
        renderer.domElement.addEventListener("pointerup", onUp);
        renderer.domElement.addEventListener("pointerleave", onUp);
        renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
        renderer.domElement.addEventListener("contextmenu", onContextMenu);
        window.addEventListener("resize", resize);

        let raf = 0;
        const tick = () => {
            // Smooth zoom interpolation
            const currentZ = camera.position.z;
            const lerpFactor = 0.1;
            if (Math.abs(currentZ - targetZoom) > 0.001) {
                camera.position.z = currentZ + (targetZoom - currentZ) * lerpFactor;
            }

            renderer.render(scene, camera);
            raf = requestAnimationFrame(tick);
        };
        tick();

        return () => {
            cancelAnimationFrame(raf);
            renderer.domElement.removeEventListener("pointerdown", onDown);
            renderer.domElement.removeEventListener("pointermove", onMove);
            renderer.domElement.removeEventListener("pointerup", onUp);
            renderer.domElement.removeEventListener("pointerleave", onUp);
            renderer.domElement.removeEventListener("wheel", onWheel);
            renderer.domElement.removeEventListener("contextmenu", onContextMenu);
            window.removeEventListener("resize", resize);
            mapMaterial.map?.dispose();
            mapMaterial.displacementMap?.dispose();
            mapMaterial.bumpMap?.dispose();
            mapMaterial.dispose();
            planeGeo.dispose();
            renderer.dispose();
            container.removeChild(renderer.domElement);
            scene.clear();
        };
    }, [world, onCellHover, onCellClick]);

    return (
        <div className="relative w-full h-full rounded-lg border border-[#1f2937] overflow-hidden bg-black">
            <div ref={containerRef} className="w-full h-full touch-none" />
            <div className="absolute inset-x-0 bottom-4 pointer-events-none flex justify-center opacity-50">
                <div className="bg-black/60 px-4 py-1.5 rounded-full border border-white/10 flex gap-4 text-[9px] tracking-widest text-cyan-400 backdrop-blur-sm">
                    <span>L-CLICK: PAN</span>
                    <span>R-CLICK: TILT/ROTATE</span>
                    <span>SCROLL: ZOOM</span>
                </div>
            </div>
        </div>
    );
}
