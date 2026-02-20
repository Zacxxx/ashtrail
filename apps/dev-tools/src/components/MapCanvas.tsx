import { useEffect, useRef } from "react";
import { GeoConfig } from "../modules/geo/types";
import { GeoGenerator } from "../modules/geo/noise";

interface MapCanvasProps {
  width?: number;
  height?: number;
  hexSize?: number;
  geoConfig: GeoConfig;
}

export function MapCanvas({ width = 800, height = 600, hexSize = 25, geoConfig }: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    
    // Initialize the generator
    const generator = new GeoGenerator(geoConfig);

    // Draw Hexagon function (Pointy-topped)
    const drawHex = (x: number, y: number, r: number, color: string) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i - 30);
        const px = x + r * Math.cos(angle);
        const py = y + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };

    const hexWidth = hexSize * Math.sqrt(3);
    const hexHeight = hexSize * 2;
    const colSpacing = hexWidth;
    const rowSpacing = hexHeight * (3 / 4);

    const cols = Math.ceil(width / colSpacing) + 1;
    const rows = Math.ceil(height / rowSpacing) + 1;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const xOffset = row % 2 === 0 ? 0 : hexWidth / 2;
        const x = col * colSpacing + xOffset;
        const y = row * rowSpacing;

        // Use the geo generator mapped to global hex grid coordinates
        // We scale the input coordinates slightly so the noise map looks cohesive locally
        const cell = generator.generateCell(col * hexSize, row * hexSize);
        drawHex(x, y, hexSize + 0.5, cell.color); // +0.5 helps avoid anti-aliasing seams
      }
    }
  }, [width, height, hexSize, geoConfig]);

  return (
    <div className="w-full h-full overflow-hidden flex items-center justify-center bg-[#0d1218] rounded-lg shadow-2xl overflow-auto border border-[#1f2937]">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="max-w-none block"
      />
    </div>
  );
}
