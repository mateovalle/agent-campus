import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AchievementInfo, RoomTemplate } from '../../../../shared/protocol.js';
import { PixelIcon } from '../../components/PixelIcon.js';
import { ICON_LOCK } from '../../components/toolbarIcons.js';
import {
  FURNITURE_PALETTE_COLUMNS,
  FURNITURE_PALETTE_VISIBLE_ROWS,
  ROOM_PALETTE_MAX_HEIGHT_PX,
} from '../../constants.js';
import { getColorizedSprite } from '../colorize.js';
import { getColorizedFloorSprite, getFloorPatternCount, hasFloorSprites } from '../floorTiles.js';
import type { FurnitureCategory, LoadedAssetData } from '../layout/furnitureCatalog.js';
import {
  getActiveCatalog,
  getActiveCategories,
  getCatalogByCategory,
} from '../layout/furnitureCatalog.js';
import { layoutToFurnitureInstances } from '../layout/layoutSerializer.js';
import { getRoomTemplates } from '../roomTemplates.js';
import { getCachedSprite } from '../sprites/spriteCache.js';
import type { FloorColor, TileType as TileTypeVal } from '../types.js';
import {
  EditTool,
  floorPatternOf,
  floorTileForPattern,
  isWallTile,
  TILE_SIZE,
  TileType,
} from '../types.js';
import { getWallStyleCount, getWallStylePreview, wallColorToHex } from '../wallTiles.js';

const btnStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: '22px',
  background: 'rgba(255, 255, 255, 0.08)',
  color: 'rgba(255, 255, 255, 0.7)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
};

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'rgba(90, 140, 255, 0.25)',
  color: 'rgba(255, 255, 255, 0.9)',
  border: '2px solid #5a8cff',
};

/** Keycap-style badge inside a button ("Rotate [R]"). */
const keyHintStyle: React.CSSProperties = {
  marginLeft: 4,
  padding: '0 5px',
  fontSize: '18px',
  background: 'rgba(255, 255, 255, 0.15)',
  border: '2px solid rgba(255, 255, 255, 0.35)',
  borderRadius: 0,
};

/** Padlock badge on a locked reward item's palette thumbnail. */
const LOCK_ICON_FG = '#e8e8f0';
const LOCK_ICON_ACCENT = '#cca700';

/** Dim keyboard legend shown next to the selected-furniture buttons. */
const shortcutLegendStyle: React.CSSProperties = {
  marginLeft: 6,
  fontSize: '18px',
  color: 'rgba(255, 255, 255, 0.5)',
  whiteSpace: 'nowrap',
};

const tabStyle: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: '20px',
  background: 'transparent',
  color: 'rgba(255, 255, 255, 0.5)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
};

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'rgba(255, 255, 255, 0.08)',
  color: 'rgba(255, 255, 255, 0.8)',
  border: '2px solid #5a8cff',
};

interface EditorToolbarProps {
  activeTool: EditTool;
  selectedTileType: TileTypeVal;
  /** Wall style the wall tool paints (index into walls.png's stacked sets). */
  selectedWallStyle: number;
  /** Room template the Rooms tool stamps (id), or null when none is picked. */
  selectedRoomTemplate: string | null;
  selectedFurnitureType: string;
  selectedFurnitureUid: string | null;
  selectedFurnitureColor: FloorColor | null;
  /** Whether the selected placed item belongs to a rotation group. */
  selectedFurnitureRotatable: boolean;
  /** Milestones from the host; reward furniture stays locked until its id is unlocked. */
  achievements: readonly AchievementInfo[];
  floorColor: FloorColor;
  wallColor: FloorColor;
  onToolChange: (tool: EditTool) => void;
  onTileTypeChange: (type: TileTypeVal) => void;
  onWallStyleChange: (style: number) => void;
  onRoomTemplateChange: (id: string) => void;
  onFloorColorChange: (color: FloorColor) => void;
  onWallColorChange: (color: FloorColor) => void;
  onSelectedFurnitureColorChange: (color: FloorColor | null) => void;
  onRotateSelected: () => void;
  onFurnitureTypeChange: (type: string) => void;
  loadedAssets?: LoadedAssetData;
}

/** Render a floor pattern preview at 2x (32x32 canvas showing the 16x16 tile) */
function FloorPatternPreview({
  patternIndex,
  color,
  selected,
  onClick,
}: {
  patternIndex: number;
  color: FloorColor;
  selected: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const displaySize = 32;
  const tileZoom = 2;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = displaySize;
    canvas.height = displaySize;
    ctx.imageSmoothingEnabled = false;

    if (!hasFloorSprites()) {
      ctx.fillStyle = '#444';
      ctx.fillRect(0, 0, displaySize, displaySize);
      return;
    }

    const sprite = getColorizedFloorSprite(patternIndex, color);
    const cached = getCachedSprite(sprite, tileZoom);
    ctx.drawImage(cached, 0, 0);
  }, [patternIndex, color]);

  return (
    <button
      onClick={onClick}
      title={`Floor ${patternIndex}`}
      style={{
        width: displaySize,
        height: displaySize,
        padding: 0,
        border: selected ? '2px solid #5a8cff' : '2px solid #4a4a6a',
        borderRadius: 0,
        cursor: 'pointer',
        overflow: 'hidden',
        flexShrink: 0,
        background: '#2A2A3A',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: displaySize, height: displaySize, display: 'block' }}
      />
    </button>
  );
}

/** A wall style's free-standing piece at 2x (32x64), tinted with the current wall colour */
function WallStylePreview({
  style,
  color,
  selected,
  onClick,
}: {
  style: number;
  color: FloorColor;
  selected: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const w = 32;
  const h = 64;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = w;
    canvas.height = h;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    const piece = getWallStylePreview(style);
    if (!piece) return;
    const tinted = getColorizedSprite(
      `wall-preview-${style}-${color.h}-${color.s}-${color.b}-${color.c}`,
      piece,
      { ...color, colorize: true },
    );
    ctx.drawImage(getCachedSprite(tinted, 2), 0, 0);
  }, [style, color]);

  return (
    <button
      onClick={onClick}
      title={`Wall style ${style + 1}`}
      style={{
        width: w,
        height: h,
        padding: 0,
        border: selected ? '2px solid #5a8cff' : '2px solid #4a4a6a',
        borderRadius: 0,
        cursor: 'pointer',
        overflow: 'hidden',
        flexShrink: 0,
        background: '#2A2A3A',
        boxSizing: 'content-box',
      }}
    >
      <canvas ref={canvasRef} style={{ width: w, height: h, display: 'block' }} />
    </button>
  );
}

/** A room template drawn small: its floors, walls and furniture at 1x, scaled to fit */
function RoomTemplateCard({
  template,
  selected,
  onClick,
}: {
  template: RoomTemplate;
  selected: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const w = 84;
  const h = 60;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    // Render at 1x with a tile of headroom for tall pieces, then fit
    const top = TILE_SIZE;
    const sceneW = template.cols * TILE_SIZE;
    const sceneH = template.rows * TILE_SIZE + top;
    const scene = document.createElement('canvas');
    scene.width = sceneW;
    scene.height = sceneH;
    const sctx = scene.getContext('2d');
    if (!sctx) return;
    for (let r = 0; r < template.rows; r++) {
      for (let c = 0; c < template.cols; c++) {
        const tile = template.tiles[r * template.cols + c];
        const color = template.tileColors[r * template.cols + c] ?? { h: 0, s: 0, b: 0, c: 0 };
        if (tile === TileType.VOID) continue;
        if (isWallTile(tile)) {
          sctx.fillStyle = wallColorToHex(color);
          sctx.fillRect(c * TILE_SIZE, top + r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else {
          const sprite = getColorizedFloorSprite(floorPatternOf(tile), color);
          sctx.drawImage(getCachedSprite(sprite, 1), c * TILE_SIZE, top + r * TILE_SIZE);
        }
      }
    }
    const items = layoutToFurnitureInstances(
      template.furniture.map((f, i) => ({ uid: `card-${i}`, ...f })),
    ).sort((a, b) => a.zY - b.zY);
    for (const f of items) sctx.drawImage(getCachedSprite(f.sprite, 1), f.x, f.y + top);

    canvas.width = w;
    canvas.height = h;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    const scale = Math.min(w / sceneW, h / sceneH);
    const dw = sceneW * scale;
    const dh = sceneH * scale;
    ctx.drawImage(scene, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }, [template]);

  return (
    <button
      onClick={onClick}
      title={`${template.label} — ${template.description} (${template.cols}×${template.rows})`}
      style={{
        padding: 2,
        border: selected ? '2px solid #5a8cff' : '2px solid #4a4a6a',
        borderRadius: 0,
        background: '#2A2A3A',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        color: 'inherit',
        font: 'inherit',
      }}
    >
      <canvas ref={canvasRef} style={{ width: w, height: h, display: 'block' }} />
      <span style={{ fontSize: '0.85em' }}>{template.label}</span>
    </button>
  );
}

/** Slider control for a single color parameter */
function ColorSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span
        style={{ fontSize: '20px', color: '#999', width: 28, textAlign: 'right', flexShrink: 0 }}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, height: 12, accentColor: 'rgba(90, 140, 255, 0.8)' }}
      />
      <span
        style={{ fontSize: '20px', color: '#999', width: 48, textAlign: 'right', flexShrink: 0 }}
      >
        {value}
      </span>
    </div>
  );
}

const DEFAULT_FURNITURE_COLOR: FloorColor = { h: 0, s: 0, b: 0, c: 0 };

export function EditorToolbar({
  activeTool,
  selectedTileType,
  selectedWallStyle,
  selectedRoomTemplate,
  selectedFurnitureType,
  selectedFurnitureUid,
  selectedFurnitureColor,
  selectedFurnitureRotatable,
  achievements,
  floorColor,
  wallColor,
  onToolChange,
  onTileTypeChange,
  onWallStyleChange,
  onRoomTemplateChange,
  onFloorColorChange,
  onWallColorChange,
  onSelectedFurnitureColorChange,
  onRotateSelected,
  onFurnitureTypeChange,
  loadedAssets,
}: EditorToolbarProps) {
  const [activeCategory, setActiveCategory] = useState<FurnitureCategory>('desks');
  const [showColor, setShowColor] = useState(false);
  const [showWallColor, setShowWallColor] = useState(false);
  const [showFurnitureColor, setShowFurnitureColor] = useState(false);
  const [furnitureQuery, setFurnitureQuery] = useState('');

  // Catalog is built in useExtensionMessages when assets load —
  // here we only reset to the first available category
  useEffect(() => {
    if (loadedAssets) {
      const firstCat = getActiveCategories()[0]?.id;
      if (firstCat) {
        console.log(`[EditorToolbar] Setting active category to: ${firstCat}`);
        setActiveCategory(firstCat);
      }
    }
  }, [loadedAssets]);

  const handleColorChange = useCallback(
    (key: keyof FloorColor, value: number) => {
      onFloorColorChange({ ...floorColor, [key]: value });
    },
    [floorColor, onFloorColorChange],
  );

  const handleWallColorChange = useCallback(
    (key: keyof FloorColor, value: number) => {
      onWallColorChange({ ...wallColor, [key]: value });
    },
    [wallColor, onWallColorChange],
  );

  // For selected furniture: use existing color or default
  const effectiveColor = selectedFurnitureColor ?? DEFAULT_FURNITURE_COLOR;
  const handleSelFurnColorChange = useCallback(
    (key: keyof FloorColor, value: number) => {
      onSelectedFurnitureColorChange({ ...effectiveColor, [key]: value });
    },
    [effectiveColor, onSelectedFurnitureColorChange],
  );

  // A search spans every category: with ~165 pieces, knowing a piece's name
  // beats guessing which tab it was filed under.
  const query = furnitureQuery.trim().toLowerCase();
  const categoryItems = query
    ? getActiveCatalog().filter(
        (e) => e.label.toLowerCase().includes(query) || e.type.toLowerCase().includes(query),
      )
    : getCatalogByCategory(activeCategory);

  // Reward furniture: locked until its achievement is unlocked. The button
  // stays visible (the point is to advertise the reward) but does nothing.
  const lockedBy = useMemo(() => {
    const byId = new Map(achievements.map((a) => [a.id, a]));
    return (unlock?: string): AchievementInfo | null => {
      if (!unlock) return null;
      const a = byId.get(unlock);
      return a && a.unlockedAt === undefined ? a : null;
    };
  }, [achievements]);

  const patternCount = getFloorPatternCount();
  // Wall is TileType 0, floor patterns are 1..patternCount
  const floorPatterns = Array.from({ length: patternCount }, (_, i) => i + 1);

  const thumbSize = 36; // 2x for items

  const isFloorActive = activeTool === EditTool.TILE_PAINT || activeTool === EditTool.EYEDROPPER;
  const isWallActive = activeTool === EditTool.WALL_PAINT;
  const isEraseActive = activeTool === EditTool.ERASE;
  const isRoomsActive = activeTool === EditTool.ROOM_STAMP;
  const isFurnitureActive =
    activeTool === EditTool.FURNITURE_PLACE || activeTool === EditTool.FURNITURE_PICK;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 68,
        left: 10,
        zIndex: 50,
        background: '#1e1e2e',
        border: '2px solid #4a4a6a',
        borderRadius: 0,
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 6,
        boxShadow: '2px 2px 0px #0a0a14',
        maxWidth: 'calc(100vw - 20px)',
      }}
    >
      {/* Tool row — at the bottom */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button
          style={activeTool === EditTool.SELECT ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.SELECT)}
          title="Select furniture: click a piece to move, rotate or delete it (red X / Delete key)"
        >
          Select
        </button>
        <button
          style={isFloorActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.TILE_PAINT)}
          title="Paint floor tiles"
        >
          Floor
        </button>
        <button
          style={isWallActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.WALL_PAINT)}
          title="Paint walls (click to toggle)"
        >
          Wall
        </button>
        <button
          style={isEraseActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.ERASE)}
          title="Erase tiles to void"
        >
          Erase
        </button>
        <button
          style={isFurnitureActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.FURNITURE_PLACE)}
          title="Place furniture"
        >
          Furniture
        </button>
        {getRoomTemplates().length > 0 && (
          <button
            style={isRoomsActive ? activeBtnStyle : btnStyle}
            onClick={() => onToolChange(EditTool.ROOM_STAMP)}
            title="Stamp a ready-made room: pick one, then click where its top-left corner goes"
          >
            Rooms
          </button>
        )}
      </div>

      {/* Sub-panel: Rooms — ready-made rooms to stamp */}
      {isRoomsActive && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              display: 'flex',
              gap: 4,
              flexWrap: 'wrap',
              maxWidth: FURNITURE_PALETTE_COLUMNS * (thumbSize + 4),
              maxHeight: ROOM_PALETTE_MAX_HEIGHT_PX,
              overflowY: 'auto',
            }}
          >
            {getRoomTemplates().map((t) => (
              <RoomTemplateCard
                key={t.id}
                template={t}
                selected={selectedRoomTemplate === t.id}
                onClick={() => onRoomTemplateChange(t.id)}
              />
            ))}
          </div>
          <span style={{ opacity: 0.6, fontSize: '0.85em' }}>
            {selectedRoomTemplate
              ? 'Click where the room’s top-left corner goes — it replaces what is there (Ctrl+Z undoes)'
              : 'Pick a room'}
          </span>
        </div>
      )}

      {/* Sub-panel: Floor tiles — stacked bottom-to-top via column-reverse */}
      {isFloorActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 6 }}>
          {/* Color toggle + Pick — just above tool row */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              style={showColor ? activeBtnStyle : btnStyle}
              onClick={() => setShowColor((v) => !v)}
              title="Adjust floor color"
            >
              Color
            </button>
            <button
              style={activeTool === EditTool.EYEDROPPER ? activeBtnStyle : btnStyle}
              onClick={() => onToolChange(EditTool.EYEDROPPER)}
              title="Pick floor pattern + color from existing tile"
            >
              Pick
            </button>
          </div>

          {/* Color controls (collapsible) — above Wall/Color/Pick */}
          {showColor && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                padding: '4px 6px',
                background: '#181828',
                border: '2px solid #4a4a6a',
                borderRadius: 0,
              }}
            >
              <ColorSlider
                label="H"
                value={floorColor.h}
                min={0}
                max={360}
                onChange={(v) => handleColorChange('h', v)}
              />
              <ColorSlider
                label="S"
                value={floorColor.s}
                min={0}
                max={100}
                onChange={(v) => handleColorChange('s', v)}
              />
              <ColorSlider
                label="B"
                value={floorColor.b}
                min={-100}
                max={100}
                onChange={(v) => handleColorChange('b', v)}
              />
              <ColorSlider
                label="C"
                value={floorColor.c}
                min={-100}
                max={100}
                onChange={(v) => handleColorChange('c', v)}
              />
            </div>
          )}

          {/* Floor patterns — wrapping grid at the top */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              flexWrap: 'wrap',
              maxWidth: FURNITURE_PALETTE_COLUMNS * (thumbSize + 4),
              paddingBottom: 2,
            }}
          >
            {floorPatterns.map((patIdx) => (
              <FloorPatternPreview
                key={patIdx}
                patternIndex={patIdx}
                color={floorColor}
                selected={selectedTileType === floorTileForPattern(patIdx)}
                onClick={() => onTileTypeChange(floorTileForPattern(patIdx))}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sub-panel: Wall — stacked bottom-to-top via column-reverse */}
      {isWallActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 6 }}>
          {/* Wall styles — painting over a wall of another style restyles it */}
          {getWallStyleCount() > 1 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {Array.from({ length: getWallStyleCount() }, (_, style) => (
                <WallStylePreview
                  key={style}
                  style={style}
                  color={wallColor}
                  selected={selectedWallStyle === style}
                  onClick={() => onWallStyleChange(style)}
                />
              ))}
            </div>
          )}
          {/* Color toggle — just above tool row */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              style={showWallColor ? activeBtnStyle : btnStyle}
              onClick={() => setShowWallColor((v) => !v)}
              title="Adjust wall color"
            >
              Color
            </button>
          </div>

          {/* Color controls (collapsible) */}
          {showWallColor && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                padding: '4px 6px',
                background: '#181828',
                border: '2px solid #4a4a6a',
                borderRadius: 0,
              }}
            >
              <ColorSlider
                label="H"
                value={wallColor.h}
                min={0}
                max={360}
                onChange={(v) => handleWallColorChange('h', v)}
              />
              <ColorSlider
                label="S"
                value={wallColor.s}
                min={0}
                max={100}
                onChange={(v) => handleWallColorChange('s', v)}
              />
              <ColorSlider
                label="B"
                value={wallColor.b}
                min={-100}
                max={100}
                onChange={(v) => handleWallColorChange('b', v)}
              />
              <ColorSlider
                label="C"
                value={wallColor.c}
                min={-100}
                max={100}
                onChange={(v) => handleWallColorChange('c', v)}
              />
            </div>
          )}
        </div>
      )}

      {/* Sub-panel: Furniture — stacked bottom-to-top via column-reverse */}
      {isFurnitureActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 4 }}>
          {/* Category tabs + Pick — just above tool row */}
          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            {getActiveCategories().map((cat) => (
              <button
                key={cat.id}
                style={activeCategory === cat.id && !query ? activeTabStyle : tabStyle}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setFurnitureQuery('');
                }}
              >
                {cat.label}
              </button>
            ))}
            <div
              style={{
                width: 1,
                height: 14,
                background: 'rgba(255,255,255,0.15)',
                margin: '0 2px',
                flexShrink: 0,
              }}
            />
            <button
              style={activeTool === EditTool.FURNITURE_PICK ? activeBtnStyle : btnStyle}
              onClick={() => onToolChange(EditTool.FURNITURE_PICK)}
              title="Pick furniture type from placed item"
            >
              Pick
            </button>
            <input
              type="search"
              value={furnitureQuery}
              onChange={(e) => setFurnitureQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setFurnitureQuery('');
              }}
              placeholder="Search…"
              aria-label="Search furniture"
              style={{
                width: 110,
                padding: '2px 6px',
                background: '#2A2A3A',
                color: 'var(--pixel-text)',
                font: 'inherit',
                border: '2px solid #4a4a6a',
                borderRadius: 0,
                outline: 'none',
              }}
            />
          </div>
          {/* Furniture items — wrapping grid at 2x, scrolls past a few rows */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              flexWrap: 'wrap',
              alignContent: 'flex-start',
              maxWidth: FURNITURE_PALETTE_COLUMNS * (thumbSize + 4),
              maxHeight: FURNITURE_PALETTE_VISIBLE_ROWS * (thumbSize + 4),
              overflowY: 'auto',
              paddingBottom: 2,
            }}
          >
            {categoryItems.length === 0 && (
              <span style={{ opacity: 0.6, padding: '8px 4px' }}>No furniture matches.</span>
            )}
            {categoryItems.map((entry) => {
              const cached = getCachedSprite(entry.sprite, 2);
              const isSelected = selectedFurnitureType === entry.type;
              const locked = lockedBy(entry.unlock);
              return (
                <button
                  key={entry.type}
                  onClick={() => {
                    if (!locked) onFurnitureTypeChange(entry.type);
                  }}
                  title={
                    // Locked descriptions stay hidden app-wide (Settings shows
                    // ACHIEVEMENT_LOCKED_DESCRIPTION), so name the milestone, not its terms.
                    locked ? `${entry.label} — locked, earn "${locked.name}"` : entry.label
                  }
                  style={{
                    width: thumbSize,
                    height: thumbSize,
                    background: '#2A2A3A',
                    border: isSelected ? '2px solid #5a8cff' : '2px solid #4a4a6a',
                    borderRadius: 0,
                    cursor: locked ? 'not-allowed' : 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0,
                    position: 'relative',
                  }}
                >
                  <canvas
                    ref={(el) => {
                      if (!el) return;
                      const ctx = el.getContext('2d');
                      if (!ctx) return;
                      const scale =
                        Math.min(thumbSize / cached.width, thumbSize / cached.height) * 0.85;
                      el.width = thumbSize;
                      el.height = thumbSize;
                      ctx.imageSmoothingEnabled = false;
                      ctx.clearRect(0, 0, thumbSize, thumbSize);
                      const dw = cached.width * scale;
                      const dh = cached.height * scale;
                      ctx.drawImage(cached, (thumbSize - dw) / 2, (thumbSize - dh) / 2, dw, dh);
                    }}
                    style={{
                      width: thumbSize,
                      height: thumbSize,
                      ...(locked ? { filter: 'grayscale(1)', opacity: 0.3 } : {}),
                    }}
                  />
                  {locked && (
                    <span
                      style={{
                        position: 'absolute',
                        right: 1,
                        bottom: 1,
                        display: 'flex',
                        pointerEvents: 'none',
                      }}
                    >
                      <PixelIcon
                        grid={ICON_LOCK}
                        fg={LOCK_ICON_FG}
                        accent={LOCK_ICON_ACCENT}
                        scale={1}
                      />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected furniture color panel — shows when any placed furniture item is selected */}
      {selectedFurnitureUid && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 3 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {selectedFurnitureRotatable && (
              <button
                style={btnStyle}
                onClick={onRotateSelected}
                title="Rotate the selected item (R key)"
              >
                ↻ Rotate <span style={keyHintStyle}>R</span>
              </button>
            )}
            <button
              style={showFurnitureColor ? activeBtnStyle : btnStyle}
              onClick={() => setShowFurnitureColor((v) => !v)}
              title="Adjust selected furniture color"
            >
              Color
            </button>
            {selectedFurnitureColor && (
              <button
                style={{ ...btnStyle, fontSize: '20px', padding: '2px 6px' }}
                onClick={() => onSelectedFurnitureColorChange(null)}
                title="Remove color (restore original)"
              >
                Clear
              </button>
            )}
            <span style={shortcutLegendStyle}>
              {selectedFurnitureRotatable ? 'R rotate · ' : ''}T toggle · Del delete · Esc deselect
            </span>
          </div>
          {showFurnitureColor && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                padding: '4px 6px',
                background: '#181828',
                border: '2px solid #4a4a6a',
                borderRadius: 0,
              }}
            >
              {effectiveColor.colorize ? (
                <>
                  <ColorSlider
                    label="H"
                    value={effectiveColor.h}
                    min={0}
                    max={360}
                    onChange={(v) => handleSelFurnColorChange('h', v)}
                  />
                  <ColorSlider
                    label="S"
                    value={effectiveColor.s}
                    min={0}
                    max={100}
                    onChange={(v) => handleSelFurnColorChange('s', v)}
                  />
                </>
              ) : (
                <>
                  <ColorSlider
                    label="H"
                    value={effectiveColor.h}
                    min={-180}
                    max={180}
                    onChange={(v) => handleSelFurnColorChange('h', v)}
                  />
                  <ColorSlider
                    label="S"
                    value={effectiveColor.s}
                    min={-100}
                    max={100}
                    onChange={(v) => handleSelFurnColorChange('s', v)}
                  />
                </>
              )}
              <ColorSlider
                label="B"
                value={effectiveColor.b}
                min={-100}
                max={100}
                onChange={(v) => handleSelFurnColorChange('b', v)}
              />
              <ColorSlider
                label="C"
                value={effectiveColor.c}
                min={-100}
                max={100}
                onChange={(v) => handleSelFurnColorChange('c', v)}
              />
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '20px',
                  color: '#999',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!effectiveColor.colorize}
                  onChange={(e) =>
                    onSelectedFurnitureColorChange({
                      ...effectiveColor,
                      colorize: e.target.checked || undefined,
                    })
                  }
                  style={{ accentColor: 'rgba(90, 140, 255, 0.8)' }}
                />
                Colorize
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
