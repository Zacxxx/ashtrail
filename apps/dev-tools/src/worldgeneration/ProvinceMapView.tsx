import { useEffect, useRef, useState, useCallback, type PointerEvent } from "react";

// ── Shader Sources ──

const VERT_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
uniform vec2 u_resolution;
uniform vec2 u_pan;
uniform float u_zoom;

void main() {
    vec2 pos = (a_position * u_zoom + u_pan) / u_resolution * 2.0 - 1.0;
    pos.y = -pos.y;
    gl_Position = vec4(pos, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
`;

const FRAG_SHADER = `
precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_baseTexture;
uniform sampler2D u_provinceIdTexture;
uniform sampler2D u_duchyIdTexture;
uniform sampler2D u_kingdomIdTexture;
uniform sampler2D u_heightTexture;
uniform sampler2D u_biomeTexture;
uniform sampler2D u_landmaskTexture;
uniform int u_layer;          // 0=provinces, 1=duchies, 2=kingdoms, 3=biome, 4=height, 5=base
uniform float u_borderWidth;
uniform float u_opacity;
uniform vec2 u_texSize;
uniform vec3 u_highlightId;   // RGB of hovered province
uniform int u_hasHighlight;

// Stable hash for ID → color
vec3 idToColor(vec3 id) {
    float h = fract(id.r * 0.13 + id.g * 0.57 + id.b * 0.91);
    float s = 0.45 + fract(id.r * 0.37 + id.b * 0.23) * 0.3;
    float v = 0.55 + fract(id.g * 0.67 + id.r * 0.11) * 0.35;
    // HSV to RGB
    float c = v * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = v - c;
    vec3 rgb;
    if      (h < 1.0/6.0) rgb = vec3(c, x, 0.0);
    else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
    else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
    else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
    else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
    else                   rgb = vec3(c, 0.0, x);
    return rgb + m;
}

vec3 biomeColor(float biomeVal) {
    int b = int(biomeVal * 255.0 + 0.5);
    if (b == 0) return vec3(0.08, 0.15, 0.35);    // ocean
    if (b == 1) return vec3(0.75, 0.82, 0.85);    // tundra
    if (b == 2) return vec3(0.2, 0.4, 0.3);       // taiga
    if (b == 3) return vec3(0.15, 0.55, 0.2);     // temperate
    if (b == 4) return vec3(0.65, 0.7, 0.32);     // grassland
    if (b == 5) return vec3(0.85, 0.72, 0.4);     // desert
    if (b == 6) return vec3(0.7, 0.6, 0.3);       // savanna
    if (b == 7) return vec3(0.1, 0.5, 0.15);      // tropical
    if (b == 8) return vec3(0.5, 0.45, 0.4);      // mountain
    if (b == 9) return vec3(0.9, 0.95, 1.0);      // ice
    return vec3(0.4, 0.2, 0.1);                    // volcanic
}

// Border detection: check if any neighbor has a different ID
float detectBorder(sampler2D idTex, vec2 uv, vec2 texelSize) {
    vec3 center = texture2D(idTex, uv).rgb;
    float border = 0.0;
    for (int dx = -1; dx <= 1; dx++) {
        for (int dy = -1; dy <= 1; dy++) {
            if (dx == 0 && dy == 0) continue;
            vec2 neighborUV = uv + vec2(float(dx), float(dy)) * texelSize * u_borderWidth;
            vec3 neighbor = texture2D(idTex, neighborUV).rgb;
            float diff = length(center - neighbor);
            if (diff > 0.001) border = 1.0;
        }
    }
    return border;
}

void main() {
    vec2 texel = 1.0 / u_texSize;
    vec3 base = texture2D(u_baseTexture, v_texCoord).rgb;
    float land = texture2D(u_landmaskTexture, v_texCoord).r;

    vec3 color;

    if (u_layer == 5) {
        // Base texture pass-through
        color = base;
    } else if (u_layer == 4) {
        // Height visualization
        float h = texture2D(u_heightTexture, v_texCoord).r;
        color = mix(vec3(0.1, 0.3, 0.15), vec3(0.95, 0.9, 0.85), h);
        if (land < 0.5) color = vec3(0.05, 0.12, 0.25);
    } else if (u_layer == 3) {
        // Biome visualization
        float b = texture2D(u_biomeTexture, v_texCoord).r;
        color = biomeColor(b);
    } else {
        // Province / Duchy / Kingdom ID visualization
        if (u_layer == 0) {
            vec3 id = texture2D(u_provinceIdTexture, v_texCoord).rgb;
            color = idToColor(id * 255.0);

            // Province borders
            float border = detectBorder(u_provinceIdTexture, v_texCoord, texel);
            if (border > 0.5) color = vec3(0.0);

            // Highlight hovered province
            if (u_hasHighlight == 1) {
                vec3 diff = abs(id * 255.0 - u_highlightId);
                if (diff.r < 0.5 && diff.g < 0.5 && diff.b < 0.5) {
                    color = mix(color, vec3(1.0, 0.9, 0.4), 0.5);
                }
            }
        } else if (u_layer == 1) {
            vec3 id = texture2D(u_duchyIdTexture, v_texCoord).rgb;
            color = idToColor(id * 255.0);
            float pBorder = detectBorder(u_provinceIdTexture, v_texCoord, texel);
            float dBorder = detectBorder(u_duchyIdTexture, v_texCoord, texel);
            if (dBorder > 0.5) color = vec3(0.0);
            else if (pBorder > 0.5) color = mix(color, vec3(0.0), 0.3);

            if (u_hasHighlight == 1) {
                vec3 diff = abs(id * 255.0 - u_highlightId);
                if (diff.r < 0.5 && diff.g < 0.5 && diff.b < 0.5) {
                    color = mix(color, vec3(1.0, 0.9, 0.4), 0.5);
                }
            }
        } else {
            vec3 id = texture2D(u_kingdomIdTexture, v_texCoord).rgb;
            color = idToColor(id * 255.0);
            float dBorder = detectBorder(u_duchyIdTexture, v_texCoord, texel);
            float kBorder = detectBorder(u_kingdomIdTexture, v_texCoord, texel);
            if (kBorder > 0.5) color = vec3(0.0);
            else if (dBorder > 0.5) color = mix(color, vec3(0.0), 0.3);

            if (u_hasHighlight == 1) {
                vec3 diff = abs(id * 255.0 - u_highlightId);
                if (diff.r < 0.5 && diff.g < 0.5 && diff.b < 0.5) {
                    color = mix(color, vec3(1.0, 0.9, 0.4), 0.5);
                }
            }
        }

        // Darken water
        if (land < 0.5) color = vec3(0.05, 0.1, 0.2);
    }

    // Blend with base
    color = mix(base * 0.5, color, u_opacity);
    gl_FragColor = vec4(color, 1.0);
}
`;

// ── Types ──

export type ProvinceLayer = "provinces" | "duchies" | "kingdoms" | "biome" | "height" | "base";

interface ProvinceMapViewProps {
    planetId: string | null;
    baseTextureUrl: string | null;
    geographyTab?: "regions" | "cells" | "pipeline" | "inspector";
    hoveredId?: number | null;
    selectedId?: number | null;
    bulkSelectedIds?: number[];
    bulkSelectActive?: boolean;
    onHover?: (id: number | null) => void;
    onClick?: (id: number | null) => void;
    onBulkToggle?: (id: number | null) => void;
    activeLayer?: any;
    onLayerChange?: (layer: any) => void;
    refreshToken?: number;
}

const LAYER_INDEX: Record<ProvinceLayer, number> = {
    provinces: 0,
    duchies: 1,
    kingdoms: 2,
    biome: 3,
    height: 4,
    base: 5,
};

const API_BASE = "http://127.0.0.1:8787";

export function ProvinceMapView({
    planetId, baseTextureUrl, geographyTab, hoveredId, selectedId, bulkSelectedIds = [], bulkSelectActive = false, onHover, onClick, onBulkToggle, activeLayer, onLayerChange, refreshToken = 0
}: ProvinceMapViewProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glRef = useRef<WebGLRenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const texturesRef = useRef<Record<string, WebGLTexture>>({});
    const pickingDataRef = useRef<Record<string, Uint8ClampedArray>>({});
    const rafRef = useRef<number>(0);
    const sizeRef = useRef({ width: 0, height: 0 });
    const texSizeRef = useRef({ width: 0, height: 0 });

    const [layer, setLayer] = useState<ProvinceLayer>(activeLayer || "provinces");
    const [opacity, setOpacity] = useState(0.85);
    const [borderWidth, setBorderWidth] = useState(1.0);
    const [loaded, setLoaded] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Pan / zoom state
    const panRef = useRef({ x: 0, y: 0 });
    const zoomRef = useRef(1);
    const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });
    const [, forceUpdate] = useState(0);

    // Highlight
    const highlightRef = useRef<[number, number, number] | null>(null);

    // ── Compile shader ──
    const compileShader = useCallback((gl: WebGLRenderingContext, type: number, src: string) => {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("Shader error:", gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }, []);

    // ── Load texture from URL ──
    const loadTexture = useCallback((gl: WebGLRenderingContext, url: string, key: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const tex = gl.createTexture()!;
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, key.includes("base") ? gl.LINEAR : gl.NEAREST);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                texturesRef.current[key] = tex;
                if (key === "base") {
                    texSizeRef.current = { width: img.width, height: img.height };
                }

                // Cache CPU-side picking data for ID maps
                if (["province_id", "duchy_id", "kingdom_id"].includes(key)) {
                    const offscreen = document.createElement("canvas");
                    offscreen.width = img.width;
                    offscreen.height = img.height;
                    const ctx = offscreen.getContext("2d", { willReadFrequently: true });
                    if (ctx) {
                        ctx.drawImage(img, 0, 0);
                        pickingDataRef.current[key] = ctx.getImageData(0, 0, img.width, img.height).data;
                    }
                }

                resolve();
            };
            img.onerror = () => reject(new Error(`Failed to load ${key}: ${url}`));
            img.src = url;
        });
    }, []);

    // ── Initialize WebGL ──
    useEffect(() => {
        if (!planetId || !baseTextureUrl) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const gl = canvas.getContext("webgl", {
            alpha: false,
            antialias: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
        });
        if (!gl) {
            setLoadError("WebGL not supported");
            return;
        }
        glRef.current = gl;

        // Compile program
        const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SHADER);
        const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SHADER);
        if (!vs || !fs) return;

        const program = gl.createProgram()!;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("Program link error:", gl.getProgramInfoLog(program));
            return;
        }
        programRef.current = program;
        gl.useProgram(program);

        // Setup geometry — fullscreen quad
        const posBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);

        // Set initial pan/zoom to fit
        const posLoc = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(posLoc);

        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
        const texLoc = gl.getAttribLocation(program, "a_texCoord");
        gl.enableVertexAttribArray(texLoc);
        gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

        // Load all textures
        const worldgenBase = `${API_BASE}/api/planets/${planetId}/worldgen`;
        const cacheBuster = `v=${refreshToken}`;
        setLoaded(false);
        setLoadError(null);
        const loadTextures = async () => {
            try {
                await loadTexture(gl, `${baseTextureUrl}${baseTextureUrl.includes("?") ? "&" : "?"}${cacheBuster}`, "base");
                await loadTexture(gl, `${worldgenBase}/province_id.png?${cacheBuster}`, "province_id");
                await loadTexture(gl, `${worldgenBase}/duchy_id.png?${cacheBuster}`, "duchy_id");
                await loadTexture(gl, `${worldgenBase}/kingdom_id.png?${cacheBuster}`, "kingdom_id");
                await loadTexture(gl, `${worldgenBase}/height16.png?${cacheBuster}`, "height");
                await loadTexture(gl, `${worldgenBase}/biome.png?${cacheBuster}`, "biome");
                await loadTexture(gl, `${worldgenBase}/landmask.png?${cacheBuster}`, "landmask");
                setLoaded(true);
                setLoadError(null);
            } catch (err: any) {
                setLoadError(err.message || "Failed to load textures");
            }
        };
        loadTextures();

        return () => {
            cancelAnimationFrame(rafRef.current);
            // Cleanup textures
            for (const tex of Object.values(texturesRef.current)) {
                gl.deleteTexture(tex);
            }
            texturesRef.current = {};
            gl.deleteProgram(program);
        };
    }, [planetId, baseTextureUrl, compileShader, loadTexture, refreshToken]);

    // ── Render loop ──
    useEffect(() => {
        if (!loaded) return;

        const gl = glRef.current;
        const program = programRef.current;
        const canvas = canvasRef.current;
        if (!gl || !program || !canvas) return;

        const render = () => {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const w = Math.round(rect.width * dpr);
            const h = Math.round(rect.height * dpr);

            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                sizeRef.current = { width: w, height: h };
            }

            gl.viewport(0, 0, w, h);
            gl.clearColor(0.03, 0.02, 0.03, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.useProgram(program);

            // Compute quad geometry to fit image aspect ratio
            const imgW = texSizeRef.current.width || 1;
            const imgH = texSizeRef.current.height || 1;
            const imgAspect = imgW / imgH;
            const canvasAspect = w / h;

            let quadW: number, quadH: number;
            if (canvasAspect > imgAspect) {
                quadH = h;
                quadW = h * imgAspect;
            } else {
                quadW = w;
                quadH = w / imgAspect;
            }

            // Center offset
            const offsetX = (w - quadW) / 2;
            const offsetY = (h - quadH) / 2;

            // Apply pan/zoom to quad vertices
            const x0 = offsetX;
            const y0 = offsetY;
            const x1 = offsetX + quadW;
            const y1 = offsetY + quadH;

            const posBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, y0, x1, y0, x0, y1, x0, y1, x1, y0, x1, y1]), gl.STATIC_DRAW);
            const posLoc = gl.getAttribLocation(program, "a_position");
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

            // Uniforms
            gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), w, h);
            gl.uniform2f(gl.getUniformLocation(program, "u_pan"), panRef.current.x, panRef.current.y);
            gl.uniform1f(gl.getUniformLocation(program, "u_zoom"), zoomRef.current);
            gl.uniform1i(gl.getUniformLocation(program, "u_layer"), LAYER_INDEX[layer]);
            gl.uniform1f(gl.getUniformLocation(program, "u_borderWidth"), borderWidth);
            gl.uniform1f(gl.getUniformLocation(program, "u_opacity"), opacity);
            gl.uniform2f(gl.getUniformLocation(program, "u_texSize"), imgW, imgH);

            // Apply specific highlight ID from parent props
            const targetHighlightId = selectedId !== null ? selectedId : hoveredId;
            const bulkTarget = bulkSelectedIds.length > 0 ? bulkSelectedIds[bulkSelectedIds.length - 1] : null;
            const effectiveHighlightId = targetHighlightId !== null ? targetHighlightId : bulkTarget;
            if (effectiveHighlightId !== null) {
                const r = effectiveHighlightId & 0xff;
                const g = (effectiveHighlightId >> 8) & 0xff;
                const b = (effectiveHighlightId >> 16) & 0xff;
                gl.uniform3f(gl.getUniformLocation(program, "u_highlightId"), r, g, b);
                gl.uniform1i(gl.getUniformLocation(program, "u_hasHighlight"), 1);
            } else {
                gl.uniform1i(gl.getUniformLocation(program, "u_hasHighlight"), 0);
            }

            // Bind textures
            const texBindings: [string, string, number][] = [
                ["base", "u_baseTexture", 0],
                ["province_id", "u_provinceIdTexture", 1],
                ["duchy_id", "u_duchyIdTexture", 2],
                ["kingdom_id", "u_kingdomIdTexture", 3],
                ["height", "u_heightTexture", 4],
                ["biome", "u_biomeTexture", 5],
                ["landmask", "u_landmaskTexture", 6],
            ];

            for (const [key, uniform, unit] of texBindings) {
                const tex = texturesRef.current[key];
                if (tex) {
                    gl.activeTexture(gl.TEXTURE0 + unit);
                    gl.bindTexture(gl.TEXTURE_2D, tex);
                    gl.uniform1i(gl.getUniformLocation(program, uniform), unit);
                }
            }

            gl.drawArrays(gl.TRIANGLES, 0, 6);
            gl.deleteBuffer(posBuffer);

            rafRef.current = requestAnimationFrame(render);
        };

        rafRef.current = requestAnimationFrame(render);
        return () => cancelAnimationFrame(rafRef.current);
    }, [loaded, layer, opacity, borderWidth, hoveredId, selectedId, bulkSelectedIds]);

    // ── Interaction: Wheel zoom ──
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.5, Math.min(8, zoomRef.current * delta));

        // Zoom toward mouse position
        const rect = canvasRef.current!.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const mx = (e.clientX - rect.left) * dpr;
        const my = (e.clientY - rect.top) * dpr;

        const zoomRatio = newZoom / zoomRef.current;
        panRef.current.x = mx - (mx - panRef.current.x) * zoomRatio;
        panRef.current.y = my - (my - panRef.current.y) * zoomRatio;
        zoomRef.current = newZoom;
        forceUpdate(n => n + 1);
    }, []);

    // ── Interaction: Pan ──
    const handlePointerDown = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
        dragRef.current = {
            dragging: true,
            startX: e.clientX,
            startY: e.clientY,
            startPanX: panRef.current.x,
            startPanY: panRef.current.y,
        };
        canvasRef.current?.setPointerCapture(e.pointerId);
    }, []);

    const handlePointerMove = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
        if (!dragRef.current.dragging && geographyTab === "inspector" && planetId) {
            const targetKey = layer === "duchies" ? "duchy_id" : layer === "kingdoms" ? "kingdom_id" : "province_id";
            const data = pickingDataRef.current[targetKey];
            if (data && texSizeRef.current.width > 0) {
                const rect = canvasRef.current!.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                const mx = (e.clientX - rect.left) * dpr;
                const my = (e.clientY - rect.top) * dpr;

                const w = sizeRef.current.width;
                const h = sizeRef.current.height;
                const imgW = texSizeRef.current.width;
                const imgH = texSizeRef.current.height;

                const imgAspect = imgW / imgH;
                const canvasAspect = w / h;

                let quadW: number, quadH: number;
                if (canvasAspect > imgAspect) {
                    quadH = h;
                    quadW = h * imgAspect;
                } else {
                    quadW = w;
                    quadH = w / imgAspect;
                }

                const offsetX = (w - quadW) / 2;
                const offsetY = (h - quadH) / 2;

                const panX = panRef.current.x;
                const panY = panRef.current.y;
                const zoom = zoomRef.current;

                const origX = (mx - panX) / zoom;
                const origY = (my - panY) / zoom;

                const u = (origX - offsetX) / quadW;
                const v = (origY - offsetY) / quadH;

                if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
                    const px = Math.floor(u * imgW);
                    const py = Math.floor(v * imgH);
                    const idx = (py * imgW + px) * 4;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];

                    if (r === 0 && g === 0 && b === 0) {
                        onHover?.(null);
                    } else {
                        const idVal = r | (g << 8) | (b << 16);
                        onHover?.(idVal);
                    }
                } else {
                    onHover?.(null);
                }
            }
            return;
        }

        if (!dragRef.current.dragging) return;

        const dpr = window.devicePixelRatio || 1;
        const dx = (e.clientX - dragRef.current.startX) * dpr;
        const dy = (e.clientY - dragRef.current.startY) * dpr;
        panRef.current.x = dragRef.current.startPanX + dx;
        panRef.current.y = dragRef.current.startPanY + dy;
        forceUpdate(n => n + 1);
    }, [geographyTab, layer, planetId, onHover]);

    const handlePointerUp = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
        dragRef.current.dragging = false;
        canvasRef.current?.releasePointerCapture(e.pointerId);

        // Detect click
        const dpr = window.devicePixelRatio || 1;
        const dx = Math.abs((e.clientX - dragRef.current.startX) * dpr);
        const dy = Math.abs((e.clientY - dragRef.current.startY) * dpr);
        if (dx < 5 && dy < 5 && geographyTab === "inspector") {
            if (bulkSelectActive) {
                onBulkToggle?.(hoveredId !== undefined ? hoveredId : null);
                return;
            }
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                onBulkToggle?.(hoveredId !== undefined ? hoveredId : null);
                return;
            }
            onClick?.(hoveredId !== undefined ? hoveredId : null);
        }
    }, [geographyTab, hoveredId, onClick, onBulkToggle, bulkSelectActive]);

    // ── No planet data ──
    if (!planetId || !baseTextureUrl) {
        return (
            <div className="w-full h-full rounded-2xl border border-white/5 bg-[#1e1e1e]/40 backdrop-blur-md flex flex-col items-center justify-center text-[10px] tracking-widest text-gray-500 gap-3">
                <div className="w-16 h-16 border border-white/10 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                </div>
                GENERATE A PLANET FIRST
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="w-full h-full rounded-2xl border border-red-500/20 bg-[#1e1e1e]/40 backdrop-blur-md flex flex-col items-center justify-center text-[10px] tracking-widest text-red-400 gap-3 p-8">
                <div className="text-2xl">⚠️</div>
                <p className="text-center leading-relaxed">{loadError}</p>
                <p className="text-gray-600 text-[9px]">Run the pipeline first to generate province textures.</p>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-black group">
            {/* WebGL Canvas */}
            <canvas
                ref={canvasRef}
                className="w-full h-full"
                onWheel={handleWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{ touchAction: "none", cursor: dragRef.current.dragging ? "grabbing" : "grab" }}
            />

            {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-10">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
                        <p className="text-[9px] font-bold tracking-[0.2em] text-gray-400">LOADING TEXTURES</p>
                    </div>
                </div>
            )}

            {/* Layer Picker Toolbar */}
            {loaded && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-full px-2 py-1 shadow-2xl">
                    {(["provinces", "duchies", "kingdoms", "biome", "height", "base"] as ProvinceLayer[]).map((l) => (
                        <button
                            key={l}
                            onClick={() => {
                                setLayer(l);
                                if (["provinces", "duchies", "kingdoms"].includes(l)) {
                                    onLayerChange?.(l);
                                }
                            }}
                            className={`px-3 py-1.5 rounded-full text-[8px] font-black tracking-[0.15em] transition-all ${layer === l
                                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                                : "text-gray-500 hover:text-gray-300 border border-transparent"
                                }`}
                        >
                            {l.toUpperCase()}
                        </button>
                    ))}
                </div>
            )}

            {/* Opacity / Border Controls */}
            {loaded && (
                <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2 bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-xl px-3 py-2 shadow-2xl">
                    <div className="flex items-center gap-2">
                        <label className="text-[7px] font-bold tracking-widest text-gray-500 w-14">OPACITY</label>
                        <input
                            type="range" min={0} max={1} step={0.05} value={opacity}
                            onChange={(e) => setOpacity(Number(e.target.value))}
                            className="w-16 h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-cyan-500"
                        />
                        <span className="text-[8px] font-mono text-gray-500 w-6 text-right">{Math.round(opacity * 100)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-[7px] font-bold tracking-widest text-gray-500 w-14">BORDER</label>
                        <input
                            type="range" min={0.5} max={3} step={0.25} value={borderWidth}
                            onChange={(e) => setBorderWidth(Number(e.target.value))}
                            className="w-16 h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-cyan-500"
                        />
                        <span className="text-[8px] font-mono text-gray-500 w-6 text-right">{borderWidth.toFixed(1)}</span>
                    </div>
                </div>
            )}

            {/* Legend */}
            {loaded && (layer === "provinces" || layer === "duchies" || layer === "kingdoms") && (
                <div className="absolute bottom-4 left-4 z-20 bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-xl px-3 py-2 shadow-2xl">
                    <p className="text-[7px] font-black tracking-[0.2em] text-gray-400 mb-1">
                        {layer === "provinces" ? "COUNTIES" : layer === "duchies" ? "DUCHIES" : "KINGDOMS"}
                    </p>
                    <p className="text-[9px] text-gray-500">
                        Colors = unique IDs • Black = borders
                    </p>
                </div>
            )}
        </div>
    );
}
