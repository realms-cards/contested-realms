/**
 * Attack of the Realm Eater - AI Module
 *
 * Deterministic rule-based AI for the Realm Eater boss
 */

export { executeRealmEaterAI } from "./engine";
export type { AIAction, AIActionType } from "./engine";
export {
  findPath,
  getNextStep,
  getManhattanDistance,
  findNearestSite,
  findRandomSite,
} from "./pathfinding";
