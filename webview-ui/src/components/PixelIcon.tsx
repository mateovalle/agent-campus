import { useEffect, useRef } from 'react';

import { TOOLBAR_ICON_SCALE } from '../constants.js';
import type { IconGrid } from './toolbarIcons.js';

interface PixelIconProps {
  grid: IconGrid;
  /** Color for 'X' cells. */
  fg: string;
  /** Color for 'A' cells. */
  accent: string;
}

/** Renders a 12×12 icon grid to a crisp, pixelated canvas. */
export function PixelIcon({ grid, fg, accent }: PixelIconProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = grid.length * TOOLBAR_ICON_SCALE;

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
        ctx.fillRect(
          x * TOOLBAR_ICON_SCALE,
          y * TOOLBAR_ICON_SCALE,
          TOOLBAR_ICON_SCALE,
          TOOLBAR_ICON_SCALE,
        );
      }
    }
  }, [grid, fg, accent]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size, imageRendering: 'pixelated', display: 'block' }}
    />
  );
}
