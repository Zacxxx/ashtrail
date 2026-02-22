import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { TerrainCell } from "../modules/geo/types";
import {
  pickTile,
  tileCell,
  type PlanetWorldData,
  type PlanetTiling
} from "../modules/planet/tiles";
import type { TilingWorkerRequest, TilingWorkerResponse } from "../workers/tiling.worker";

interface PlanetGlobeProps {
  world: PlanetWorldData;
  onCellHover?: (cell: TerrainCell | null) => void;
  onCellClick?: (cell: TerrainCell | null) => void;
  showHexGrid?: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function lonLatToVec3(lon: number, lat: number, radius: number): THREE.Vector3 {
  const clat = Math.cos(lat);
  return new THREE.Vector3(
    radius * clat * Math.cos(lon),
    radius * Math.sin(lat),
    radius * clat * Math.sin(lon)
  );
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
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function PlanetGlobe({ world, onCellHover, onCellClick }: PlanetGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const [tiling, setTiling] = useState<PlanetTiling | null>(null);
  const [isGeneratingGeometry, setIsGeneratingGeometry] = useState(false);

  useEffect(() => {
    setIsGeneratingGeometry(true);
    setTiling(null);

    const worker = new Worker(new URL("../workers/tiling.worker.ts", import.meta.url), { type: "module" });

    worker.onmessage = (e: MessageEvent<TilingWorkerResponse>) => {
      if (e.data.type === 'TILING_COMPLETE') {
        setTiling(e.data.tiling);
        setIsGeneratingGeometry(false);
      } else if (e.data.type === 'TILING_ERROR') {
        console.error("Worker failed:", e.data.error);
        setIsGeneratingGeometry(false);
      }
    };

    // Strip out the massive textureUrl, cellData, and cellColors arrays so we don't 
    // freeze the browser or crash V8 during structured clone serialization.
    const req: TilingWorkerRequest = {
      type: 'BUILD_TILING',
      world: {
        cols: world.cols,
        rows: world.rows,
        cellData: [],
      }
    };
    worker.postMessage(req);

    return () => worker.terminate();
  }, [world]);

  useEffect(() => {
    if (!tiling) return;
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

    // ── Heightmap generation from color texture ──
    function generateHeightmapFromImage(image: HTMLImageElement | HTMLCanvasElement): THREE.CanvasTexture {
      const w = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
      const h = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const src = imageData.data;

      // Convert color → elevation heuristic:
      // Deep ocean (blue-dominant) → 0.0
      // Shallow water → 0.15
      // Lowland green → 0.3
      // Highland brown → 0.55
      // Mountain gray → 0.75
      // Snow/ice white → 0.95
      for (let i = 0; i < src.length; i += 4) {
        const r = src[i] / 255;
        const g = src[i + 1] / 255;
        const b = src[i + 2] / 255;
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        let elevation: number;

        // Ocean detection: blue is dominant channel
        const isWater = b > r * 1.15 && b > g * 1.05 && luminance < 0.55;
        if (isWater) {
          // Map deep blue → 0.0, lighter blue → 0.15
          elevation = luminance * 0.3;
        } else {
          // Land: use luminance but boost contrast
          // Green lowlands → mid, brown highlands → higher, white peaks → highest
          const greenness = g - Math.max(r, b);
          if (greenness > 0.05) {
            // Vegetation: moderate elevation
            elevation = 0.25 + luminance * 0.35;
          } else if (luminance > 0.75) {
            // Snow/ice/peaks
            elevation = 0.7 + (luminance - 0.75) * 1.2;
          } else {
            // Brown/gray terrain
            elevation = 0.3 + luminance * 0.5;
          }
        }

        const v = Math.min(255, Math.max(0, Math.round(elevation * 255)));
        src[i] = v;
        src[i + 1] = v;
        src[i + 2] = v;
        // alpha stays 255
      }

      ctx.putImageData(imageData, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      return tex;
    }

    // ── Load color texture and derive heightmap ──
    let globeMaterial: THREE.MeshStandardMaterial;

    if (world.textureUrl) {
      const loader = new THREE.TextureLoader();
      const texture = loader.load(world.textureUrl, (loadedTex) => {
        // Once the color texture is loaded, derive the heightmap from it
        const heightmap = generateHeightmapFromImage(loadedTex.image);
        globeMaterial.displacementMap = heightmap;
        globeMaterial.displacementScale = 0.06;
        globeMaterial.bumpMap = heightmap;
        globeMaterial.bumpScale = 0.04;
        globeMaterial.needsUpdate = true;
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      globeMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.92,
        metalness: 0.0,
      });
    } else {
      const texture = makeTexture(world);
      texture.colorSpace = THREE.SRGBColorSpace;
      globeMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.92,
        metalness: 0.0,
      });
    }

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 256, 256),
      globeMaterial
    );
    scene.add(globe);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.03, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x76a9ff, transparent: true, opacity: 0.08 })
    );
    scene.add(atmosphere);

    // ── Hex tile overlay with brighter, more visible lines ──
    const tileOverlayVertices: number[] = [];
    const tileRadius = 1.006;
    for (const tile of tiling.tiles) {
      for (let i = 0; i < tile.vertices.length; i++) {
        const a = tile.vertices[i];
        const b = tile.vertices[(i + 1) % tile.vertices.length];
        if (Math.abs(a.lon - b.lon) > Math.PI * 0.9) continue;
        const av = lonLatToVec3(a.lon, a.lat, tileRadius);
        const bv = lonLatToVec3(b.lon, b.lat, tileRadius);
        tileOverlayVertices.push(av.x, av.y, av.z, bv.x, bv.y, bv.z);
      }
    }
    const tileOverlayGeo = new THREE.BufferGeometry();
    tileOverlayGeo.setAttribute("position", new THREE.Float32BufferAttribute(tileOverlayVertices, 3));
    const tileOverlay = new THREE.LineSegments(
      tileOverlayGeo,
      new THREE.LineBasicMaterial({
        color: 0xe0f0ff,
        transparent: true,
        opacity: 0.45,
      })
    );
    scene.add(tileOverlay);

    const highlightGeo = new THREE.BufferGeometry();
    const highlightLine = new THREE.LineLoop(
      highlightGeo,
      new THREE.LineBasicMaterial({ color: 0x18d4d2, transparent: true, opacity: 0.95 })
    );
    highlightLine.visible = false;
    scene.add(highlightLine);

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

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();

    // ── Mouse Wheel Zoom ──
    const MIN_ZOOM = 1.5;
    const MAX_ZOOM = 6.0;
    let targetZoom = camera.position.z;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSpeed = 0.15;
      const delta = e.deltaY > 0 ? zoomSpeed : -zoomSpeed;
      targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom + delta));
    };

    // ── Drag Rotation ──
    let dragging = false;
    let hasDragged = false;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e: PointerEvent) => {
      dragging = true;
      hasDragged = false;
      lastX = e.clientX;
      lastY = e.clientY;
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };

    const syncRotations = () => {
      atmosphere.rotation.copy(globe.rotation);
      tileOverlay.rotation.copy(globe.rotation);
      highlightLine.rotation.copy(globe.rotation);
    };

    const onMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          hasDragged = true;
        }
        lastX = e.clientX;
        lastY = e.clientY;
        globe.rotation.y += dx * 0.005;
        globe.rotation.x += dy * 0.003;
        globe.rotation.x = Math.max(-1.2, Math.min(1.2, globe.rotation.x));
        syncRotations();
        return;
      }

      // Fast mathematically projected tile picking (avoids huge 256-seg raycast)
      const ray = new THREE.Ray();
      raycaster.setFromCamera(pointer, camera);
      ray.copy(raycaster.ray);
      const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1.0);
      const target = new THREE.Vector3();
      const hit = ray.intersectSphere(sphere, target);

      if (!hit) {
        setHoveredTileId(null);
        onCellHover?.(null);
        highlightLine.visible = false;
        return;
      }

      // Convert local hit coordinate back through globe rotation to get proper lat/lon
      const localP = hit.clone().applyMatrix4(globe.matrixWorld.clone().invert()).normalize();
      const lon = Math.atan2(localP.z, localP.x);
      const lat = Math.asin(localP.y);

      const tile = pickTile(tiling, lon, lat);
      setHoveredTileId(tile?.id ?? null);
      if (tile) {
        onCellHover?.((tileCell(world, tile) as TerrainCell | null) ?? null);
      } else {
        onCellHover?.(null);
      }

      if (!tile) {
        highlightLine.visible = false;
        return;
      }

      const verts: number[] = [];
      for (const v of tile.vertices) {
        const q = lonLatToVec3(v.lon, v.lat, tileRadius + 0.006);
        verts.push(q.x, q.y, q.z);
      }
      highlightGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      highlightGeo.computeBoundingSphere();
      highlightLine.visible = true;
    };

    const onUp = () => {
      if (!hasDragged && dragging) {
        // Detect click
        const ray = new THREE.Ray();
        raycaster.setFromCamera(pointer, camera);
        ray.copy(raycaster.ray);
        const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1.0);
        const target = new THREE.Vector3();
        const hit = ray.intersectSphere(sphere, target);

        if (hit && tiling) {
          const localP = hit.clone().applyMatrix4(globe.matrixWorld.clone().invert()).normalize();
          const lon = Math.atan2(localP.z, localP.x);
          const lat = Math.asin(localP.y);

          const tile = pickTile(tiling, lon, lat);
          if (tile) {
            onCellClick?.((tileCell(world, tile) as TerrainCell | null) ?? null);
          } else {
            onCellClick?.(null);
          }
        }
      }
      dragging = false;
      hasDragged = false;
    };

    const onLeave = () => {
      dragging = false;
      setHoveredTileId(null);
      onCellHover?.(null);
      highlightLine.visible = false;
    };

    renderer.domElement.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", onLeave);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", resize);

    let raf = 0;
    const tick = () => {
      // Smooth zoom interpolation
      const currentZ = camera.position.z;
      const lerpFactor = 0.08;
      if (Math.abs(currentZ - targetZoom) > 0.001) {
        camera.position.z = currentZ + (targetZoom - currentZ) * lerpFactor;
      }

      if (!dragging) {
        globe.rotation.y += 0.0008;
        syncRotations();
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
      globeMaterial.map?.dispose();
      globeMaterial.displacementMap?.dispose();
      globeMaterial.bumpMap?.dispose();
      globeMaterial.dispose();
      tileOverlayGeo.dispose();
      highlightGeo.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      scene.clear();
    };
  }, [world, tiling, onCellHover, onCellClick]);

  return (
    <div className="relative w-full h-full rounded-lg border border-[#1f2937] overflow-hidden bg-black">
      {isGeneratingGeometry && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
          <svg className="animate-spin w-12 h-12 text-purple-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-[10px] font-bold tracking-[0.2em] text-purple-400">CONSTRUCTING HEX MATRIX...</span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" data-hovered-tile={hoveredTileId ?? ""} />
    </div>
  );
}
