/**
 * catalog-meta.ts — The per-sprite catalog metadata type.
 *
 * Batches 1–9 keep their metadata in export.ts's CATALOG_META. Batch 10
 * onward ship it beside their art (`export const METAnn`), so batches can be
 * drawn in parallel without every one of them editing export.ts.
 */

export interface CatalogMeta {
  category: 'desks' | 'chairs' | 'storage' | 'electronics' | 'decor' | 'wall' | 'misc';
  isDesk?: boolean;
  canPlaceOnWalls?: boolean;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  /** Achievement id that unlocks this piece in the editor palette. */
  unlock?: string;
}
