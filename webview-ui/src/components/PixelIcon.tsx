import { useEffect, useRef } from 'react';

import { TOOLBAR_ICON_SCALE } from '../constants.js';
import type { IconGrid } from './toolbarIcons.js';

interface PixelIconProps {
  grid: IconGrid;
  /** Color for 'X' cells. */
  fg: string;
  /** Color for 'A' cells. */
  accent: string;
  /** Device px per icon pixel (defaults to the toolbar scale). */
  scale?: number;
}

/** Renders a 12×12 icon grid to a crisp, pixelated canvas. */
export function PixelIcon({ grid, fg, accent, scale = TOOLBAR_ICON_SCALE }: PixelIconProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = grid.length * scale;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        ctx.fillStyle = ch === 'A' ? accent : fg;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }, [grid, fg, accent, scale]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size, imageRendering: 'pixelated', display: 'block' }}
    />
  );
}
