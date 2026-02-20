import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { TerrainCell } from "../modules/geo/types";
import {
  buildPlanetTiling,
  pickTile,
  tileCell,
  type PlanetWorldData,
} from "../modules/planet/tiles";

interface PlanetGlobeProps {
  world: PlanetWorldData;
  onCellHover?: (cell: TerrainCell | null) => void;
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
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function PlanetGlobe({ world, onCellHover }: PlanetGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const tiling = useMemo(() => buildPlanetTiling(world), [world]);

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

    const texture = makeTexture(world);
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 128),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0.0 })
    );
    scene.add(globe);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.03, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x76a9ff, transparent: true, opacity: 0.08 })
    );
    scene.add(atmosphere);

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
      new THREE.LineBasicMaterial({ color: 0xd8e7ff, transparent: true, opacity: 0.24 })
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
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        globe.rotation.y += dx * 0.005;
        globe.rotation.x += dy * 0.003;
        globe.rotation.x = Math.max(-1.2, Math.min(1.2, globe.rotation.x));
        atmosphere.rotation.copy(globe.rotation);
        tileOverlay.rotation.copy(globe.rotation);
        highlightLine.rotation.copy(globe.rotation);
        return;
      }

      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(globe, false)[0];
      if (!hit) {
        setHoveredTileId(null);
        onCellHover?.(null);
        highlightLine.visible = false;
        return;
      }

      const p = hit.point.clone().normalize();
      const lon = Math.atan2(p.z, p.x);
      const lat = Math.asin(p.y);
      const tile = pickTile(tiling, lon, lat);
      setHoveredTileId(tile?.id ?? null);
      onCellHover?.((tileCell(world, tile) as TerrainCell | null) ?? null);

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
      dragging = false;
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
    window.addEventListener("resize", resize);

    let raf = 0;
    const tick = () => {
      if (!dragging) {
        globe.rotation.y += 0.0008;
        atmosphere.rotation.y += 0.0008;
        tileOverlay.rotation.y += 0.0008;
        highlightLine.rotation.y += 0.0008;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", resize);
      texture.dispose();
      tileOverlayGeo.dispose();
      highlightGeo.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      scene.clear();
    };
  }, [world, tiling, onCellHover]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-lg border border-[#1f2937] overflow-hidden"
      data-hovered-tile={hoveredTileId ?? ""}
    />
  );
}
