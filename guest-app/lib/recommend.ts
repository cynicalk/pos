import menuData from "@/data/menu.json";
import type { Dish } from "@/types";
import {
  createRecommender,
  collectAllergens,
  setMinedAffinities,
  FEATURE_WEIGHTS,
  REFINE_OPTIONS,
  type MinedAffinityRule,
} from "./recommend-core";

/**
 * Guest-app adapter over the canonical shared recommender core
 * (`lib/recommend-core.ts`, byte-identical to the ops back-office copy — see
 * that file's header and scripts/check-recommend-core.mjs in the ops repo).
 *
 * This app supplies its bundled menu; the core supplies the four-stage
 * pipeline. Every symbol the pages already import is re-exported here, so
 * nothing downstream changed when the engine moved into the shared core.
 */

export const DISHES = menuData.dishes as Dish[];
export const RESTAURANT = menuData.restaurant;

const engine = createRecommender(DISHES);

export const recommend = engine.recommend;
export const suggestUpsells = engine.suggestUpsells;

export { collectAllergens, setMinedAffinities, FEATURE_WEIGHTS, REFINE_OPTIONS };
export type { MinedAffinityRule };
