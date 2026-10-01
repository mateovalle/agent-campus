/**
 * room-templates.ts — Ready-made rooms you stamp into an office in one click.
 *
 * Run from the repo root:
 *   node --experimental-strip-types scripts/asset-gen/room-templates.ts
 *
 * Writes webview-ui/public/assets/room-templates.json, which the host sends
 * as `roomTemplatesLoaded` and the layout editor's Rooms tool offers. The
 * catalog has ~165 pieces; nobody finds a koi pond by scrolling a palette,
 * so these rooms are how a new user discovers what the campus can look like.
 *
 * Each template is a small layout: tile zones (floor patterns and wall
 * styles by id, so the numbers can't drift) plus furniture at template
 * coordinates. Indoor rooms keep row 0 as wall so wall pieces have
 * somewhere to hang; outdoor ones are open. Every template is validated with
 * the editor's placement rules (layout-validate.ts) before it is written.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { FloorColor, PlacedFurniture } from './layout-validate.ts';
import {
  ASSETS_DIR,
  countSeats,
  floorTile,
  loadCatalog,
  validateLayout,
  wallTile,
} from './layout-validate.ts';

const OUT_PATH = path.join(ASSETS_DIR, 'room-templates.json');

interface Zone {
  /** Inclusive tile rect. */
  c0: number;
  r0: number;
  c1: number;
  r1: number;
  /** floors.ts id ('floor_*') or walls.ts id ('wall_*'). */
  tile: string;
  color: FloorColor;
}

interface TemplateDef {
  id: string;
  label: string;
  description: string;
  cols: number;
  rows: number;
  /** Painted in order; later zones win. */
  zones: Zone[];
  furniture: Array<[type: string, col: number, row: number]>;
}

// Colorize recipes
const WALL_WARM: FloorColor = { h: 30, s: 18, b: 0, c: 0 };
const WALL_COOL: FloorColor = { h: 214, s: 18, b: -10, c: 0 };
const WALL_DARK: FloorColor = { h: 220, s: 20, b: -40, c: -10 };
const GRASS: FloorColor = { h: 95, s: 40, b: -10, c: 0 };

/** An indoor room: wall row on top in `wall`, everything below in `floor`. */
function room(
  cols: number,
  rows: number,
  wall: string,
  wallColor: FloorColor,
  floor: string,
  floorColor: FloorColor,
): Zone[] {
  return [
    { c0: 0, r0: 1, c1: cols - 1, r1: rows - 1, tile: floor, color: floorColor },
    { c0: 0, r0: 0, c1: cols - 1, r1: 0, tile: wall, color: wallColor },
  ];
}

const TEMPLATES: TemplateDef[] = [
  {
    id: 'cafe',
    label: 'Café',
    description: 'Espresso bar, pastry case and two little tables',
    cols: 8,
    rows: 6,
    zones: room(8, 6, 'wall_brick', WALL_WARM, 'floor_subway', { h: 40, s: 20, b: 10, c: 0 }),
    furniture: [
      ['menu_board', 1, 0],
      ['window', 4, 0],
      ['wall_clock', 7, 0],
      ['espresso_bar', 1, 1],
      ['bakery_case', 3, 1],
      ['pantry_shelf', 5, 1],
      ['fridge', 6, 1],
      ['gumball_machine', 7, 1],
      ['bar_stool', 1, 2],
      ['bar_stool', 2, 2],
      ['cafe_table', 1, 3],
      ['coffee_mug', 1, 3],
      ['fruit_bowl', 2, 3],
      ['bar_stool_back', 1, 4],
      ['bar_stool_back', 2, 4],
      ['bar_stool', 5, 2],
      ['bar_stool', 6, 2],
      ['cafe_table', 5, 3],
      ['cup_noodles', 6, 3],
      ['bar_stool_back', 5, 4],
      ['bar_stool_back', 6, 4],
      ['fiddle_fig', 0, 5],
      ['popcorn_cart', 7, 5],
    ],
  },
  {
    id: 'game-room',
    label: 'Game Room',
    description: 'Pool table, arcade row, pinball and a jukebox',
    cols: 9,
    rows: 6,
    zones: room(9, 6, 'wall_wainscot', WALL_DARK, 'floor_carpet', { h: 270, s: 30, b: -35, c: 0 }),
    furniture: [
      ['dartboard', 1, 0],
      ['string_lights', 3, 0],
      ['bunting', 6, 0],
      ['arcade_machine', 0, 1],
      ['pinball', 1, 1],
      ['claw_machine', 2, 1],
      ['jukebox', 8, 1],
      ['pool_table', 4, 2],
      ['foosball', 0, 4],
      ['air_hockey', 7, 4],
      ['beanbag', 3, 5],
      ['beanbag', 4, 5],
    ],
  },
  {
    id: 'hardware-lab',
    label: 'Hardware Lab',
    description: 'Workbenches, a 3D printer, a robot arm and the tool chest',
    cols: 8,
    rows: 6,
    zones: room(8, 6, 'wall_concrete', WALL_COOL, 'floor_rubber', { h: 190, s: 15, b: -20, c: 0 }),
    furniture: [
      ['whiteboard', 1, 0],
      ['andon_light', 4, 0],
      ['tv_dashboard', 6, 0],
      ['parts_cabinet', 0, 1],
      ['workbench', 1, 1],
      ['soldering_station', 1, 1],
      ['oscilloscope', 2, 1],
      ['lab_stool_back', 1, 2],
      ['workbench', 4, 1],
      ['printer_3d', 4, 1],
      ['laptop', 5, 1],
      ['lab_stool_back', 5, 2],
      ['tool_chest', 7, 1],
      ['robot_arm', 7, 3],
      ['esd_mat', 3, 4],
      ['cardboard_boxes', 0, 5],
    ],
  },
  {
    id: 'server-room',
    label: 'Server Room',
    description: 'Racks with blinking lights and an ops desk facing the NOC wall',
    cols: 6,
    rows: 5,
    zones: room(6, 5, 'wall_concrete', WALL_DARK, 'floor_diamond_plate', {
      h: 210,
      s: 15,
      b: -25,
      c: 0,
    }),
    furniture: [
      ['patch_panel', 0, 0],
      ['noc_wall', 2, 0],
      ['andon_light', 5, 0],
      ['server_cluster', 0, 1],
      ['server_cluster', 2, 1],
      ['server_rack', 4, 1],
      ['ups_tower', 5, 1],
      ['desk_single', 1, 3],
      ['monitor_single', 1, 3],
      ['laptop', 2, 3],
      ['chair_office_back', 1, 4],
    ],
  },
  {
    id: 'meeting-room',
    label: 'Meeting Room',
    description: 'Glass walls, a table for eight and a projector screen',
    cols: 8,
    rows: 6,
    zones: room(8, 6, 'wall_glass', WALL_COOL, 'floor_carpet', { h: 215, s: 20, b: -20, c: 0 }),
    furniture: [
      ['projector_screen', 1, 0],
      ['whiteboard', 4, 0],
      ['wall_clock', 7, 0],
      ['chair_office', 2, 1],
      ['chair_office', 3, 1],
      ['chair_office', 4, 1],
      ['chair_office_right', 1, 2],
      ['meeting_table', 2, 2],
      ['laptop', 2, 2],
      ['coffee_mug', 4, 3],
      ['chair_office_left', 5, 2],
      ['chair_office_back', 2, 4],
      ['chair_office_back', 3, 4],
      ['chair_office_back', 4, 4],
      ['water_dispenser', 7, 1],
      ['snake_plant', 7, 5],
    ],
  },
  {
    id: 'library',
    label: 'Library',
    description: 'Shelves, a card catalog, a reading nook and a study table',
    cols: 8,
    rows: 6,
    zones: room(8, 6, 'wall_wainscot', WALL_WARM, 'floor_herringbone', {
      h: 30,
      s: 30,
      b: -30,
      c: 0,
    }),
    furniture: [
      ['painting_landscape', 1, 0],
      ['cuckoo_clock', 4, 0],
      ['window', 6, 0],
      ['library_shelf', 0, 1],
      ['library_shelf', 2, 1],
      ['card_catalog', 4, 1],
      ['bookshelf_tall', 5, 1],
      ['bookshelf_tall', 6, 1],
      ['globe', 7, 1],
      ['rug_round', 0, 3],
      ['reading_armchair', 0, 3],
      ['side_table', 1, 3],
      ['book_stack', 1, 3],
      ['chair_office_right', 3, 3],
      ['round_table', 4, 3],
      ['bankers_lamp', 4, 3],
      ['book_stack', 5, 4],
      ['chair_office_left', 6, 4],
    ],
  },
  {
    id: 'lounge',
    label: 'Lounge',
    description: 'Couches round a rug, beanbags, a TV and the fish tank',
    cols: 8,
    rows: 6,
    zones: room(8, 6, 'wall_classic', WALL_WARM, 'floor_oak_wide', { h: 32, s: 35, b: -20, c: 0 }),
    furniture: [
      ['window', 1, 0],
      ['hanging_plant', 4, 0],
      ['poster_ship', 6, 0],
      ['fiddle_fig', 0, 1],
      ['fish_tank', 3, 1],
      ['tv_console', 5, 1],
      ['vending_machine', 7, 1],
      ['couch', 1, 2],
      ['rug_large', 1, 3],
      ['coffee_table', 1, 4],
      ['couch_back', 1, 5],
      ['beanbag', 5, 3],
      ['beanbag', 6, 4],
    ],
  },
  {
    id: 'focus-row',
    label: 'Focus Row',
    description: 'Three quiet booths under the deploy board',
    cols: 6,
    rows: 3,
    zones: room(6, 3, 'wall_cubicle', WALL_COOL, 'floor_carpet', { h: 200, s: 15, b: -30, c: 0 }),
    furniture: [
      ['deploy_board', 1, 0],
      ['focus_booth', 0, 1],
      ['snake_plant', 1, 1],
      ['focus_booth', 2, 1],
      ['snake_plant', 3, 1],
      ['focus_booth', 4, 1],
      ['ship_gong', 5, 1],
    ],
  },
  {
    id: 'garden',
    label: 'Garden',
    description: 'Cherry tree, koi pond and benches round a campfire',
    cols: 9,
    rows: 7,
    zones: [{ c0: 0, r0: 0, c1: 8, r1: 6, tile: 'floor_grass', color: GRASS }],
    furniture: [
      ['cherry_tree', 0, 0],
      ['pine_tree', 8, 0],
      ['koi_pond', 5, 1],
      ['bench', 2, 3],
      ['campfire', 3, 4],
      ['bench_back', 2, 5],
      ['garden_gnome', 5, 4],
      ['mailbox', 8, 4],
      ['stepping_stones', 4, 5],
      ['stepping_stones', 4, 6],
      ['planter_box', 0, 6],
      ['hedge', 7, 6],
    ],
  },
  {
    id: 'capybara-onsen',
    label: 'Capybara Onsen',
    description: 'A steaming hot spring on a deck, with the campus mascot',
    cols: 7,
    rows: 6,
    zones: [
      { c0: 0, r0: 0, c1: 6, r1: 5, tile: 'floor_grass', color: GRASS },
      { c0: 1, r0: 1, c1: 5, r1: 4, tile: 'floor_deck', color: { h: 28, s: 35, b: -15, c: 0 } },
    ],
    furniture: [
      ['capybara_onsen', 1, 1],
      ['capybara_statue', 4, 1],
      ['ship_gong', 5, 1],
      ['snake_plant', 0, 0],
      ['cherry_tree', 5, 3],
      ['stepping_stones', 3, 5],
      ['stepping_stones', 2, 5],
      ['flower_bed', 0, 5],
    ],
  },
];

// ── Build + validate ─────────────────────────────────────────────

const catalog = loadCatalog();
let failed = false;
const out = TEMPLATES.map((t) => {
  const tiles = new Array<number>(t.cols * t.rows).fill(0);
  const tileColors = new Array<FloorColor | null>(t.cols * t.rows).fill(null);
  for (const z of t.zones) {
    const value = z.tile.startsWith('wall_') ? wallTile(z.tile) : floorTile(z.tile);
    for (let r = z.r0; r <= z.r1; r++) {
      for (let c = z.c0; c <= z.c1; c++) {
        tiles[r * t.cols + c] = value;
        tileColors[r * t.cols + c] = { ...z.color };
      }
    }
  }
  const furniture: PlacedFurniture[] = t.furniture.map(([type, col, row], i) => ({
    uid: `${t.id}-${String(i + 1).padStart(2, '0')}`,
    type,
    col,
    row,
  }));
  const errors = validateLayout({ cols: t.cols, rows: t.rows, tiles, furniture }, catalog);
  if (errors.length > 0) {
    failed = true;
    console.error(`✗ ${t.id}:`);
    for (const e of errors) console.error('  ' + e);
  } else {
    console.log(
      `  ${t.id.padEnd(16)} ${t.cols}x${t.rows}  ${String(furniture.length).padStart(2)} pieces  ${countSeats(furniture, catalog)} seats`,
    );
  }
  return {
    id: t.id,
    label: t.label,
    description: t.description,
    cols: t.cols,
    rows: t.rows,
    tiles,
    tileColors,
    furniture: furniture.map(({ type, col, row }) => ({ type, col, row })),
  };
});

if (failed) process.exit(1);
fs.writeFileSync(OUT_PATH, JSON.stringify({ templates: out }) + '\n');
console.log(`✓ room-templates.json: ${out.length} rooms → ${OUT_PATH}`);
