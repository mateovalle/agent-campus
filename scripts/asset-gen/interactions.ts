/**
 * interactions.ts — Which furniture idle agents go and use.
 *
 * An agent with nothing to do used to wander to random tiles. Pieces listed
 * here are destinations instead: the agent walks to a free tile beside the
 * piece, turns to face it and stays a while.
 *
 *   'use'  — hands busy (typing pose): arcade, pool table, piano, espresso bar
 *   'look' — standing and looking (idle pose): fish tank, notice board, fountain
 *
 * Kept apart from the art (spritesNN.ts) because it is behaviour, not
 * drawing; export.ts copies it onto each catalog entry as `interact`. A
 * rotation variant inherits its group's entry unless listed itself.
 */

export type InteractKind = 'use' | 'look';

export const INTERACTIONS: Record<string, InteractKind> = {
  // hands busy
  arcade_machine: 'use',
  pingpong_table: 'use',
  pool_table: 'use',
  foosball: 'use',
  pinball: 'use',
  air_hockey: 'use',
  claw_machine: 'use',
  piano: 'use',
  drum_kit: 'use',
  jukebox: 'use',
  espresso_bar: 'use',
  coffee_machine: 'use',
  vending_machine: 'use',
  water_dispenser: 'use',
  microwave: 'use',
  kitchen_range: 'use',
  popcorn_cart: 'use',
  gumball_machine: 'use',
  fridge: 'use',
  workbench: 'use',
  printer_3d: 'use',
  robot_arm: 'use',
  server_rack: 'use',
  server_cluster: 'use',
  printer: 'use',
  record_player: 'use',
  // standing and looking
  fish_tank: 'look',
  whiteboard: 'look',
  corkboard: 'look',
  tv_dashboard: 'look',
  deploy_board: 'look',
  noc_wall: 'look',
  world_map: 'look',
  painting_landscape: 'look',
  art_abstract: 'look',
  portrait_capy: 'look',
  menu_board: 'look',
  poster_ship: 'look',
  poster_code: 'look',
  window: 'look',
  bookshelf_tall: 'look',
  bookshelf_short: 'look',
  library_shelf: 'look',
  card_catalog: 'look',
  globe: 'look',
  fountain: 'look',
  koi_pond: 'look',
  cherry_tree: 'look',
  campfire: 'look',
  capybara_statue: 'look',
  capybara_onsen: 'look',
  bakery_case: 'look',
  trophy_case: 'look',
  tv_console: 'look',
};
