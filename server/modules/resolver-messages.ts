"use strict";

/**
 * Registry of custom resolver message types that the match server relays
 * verbatim to everyone in the match room.
 *
 * The `socket.on("message")` handler in `server/index.ts` matches message types
 * with an explicit if/else chain and has no generic fallback, so a type that is
 * missing here is silently dropped: the sender's client believes it broadcast,
 * and the opponent never sees the overlay, reveal or log. Adding a resolver
 * message type here is the ONLY thing needed to make it reach the other player.
 *
 * Before adding a type, check its handler in
 * `src/lib/game/store/customMessageHandlers.ts`: relayed messages are echoed
 * back to the sender as well, and a handler that re-applies game state which
 * the sender already applied locally (and already sent as a patch) will double
 * apply. Such handlers must either be made idempotent or have their type listed
 * in ECHO_SUPPRESSED_TYPES on the client.
 */
export const RESOLVER_RELAY_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  // Chaos Twister
  "chaosTwisterBegin",
  "chaosTwisterSelectMinion",
  "chaosTwisterSelectSite",
  "chaosTwisterMinigameResult",
  "chaosTwisterResolve",
  "chaosTwisterCancel",
  "chaosTwisterSliderPosition",
  // Pith Imp
  "pithImpSteal",
  "pithImpReturn",
  // Accusation
  "accusationBegin",
  "accusationSelectCard",
  "accusationResolve",
  "accusationCancel",
  // The Inquisition
  "inquisitionBegin",
  "inquisitionSelectCard",
  "inquisitionResolve",
  "inquisitionSkip",
  "inquisitionCancel",
  "inquisitionSummonOffer",
  "inquisitionSummonAccept",
  "inquisitionSummonPlace",
  "inquisitionSummonDecline",
  // Legion of Gall
  "legionOfGallBegin",
  "legionOfGallConfirm",
  "legionOfGallSelect",
  "legionOfGallResolve",
  "legionOfGallCancel",
  // Kingswood Poachers
  "kingswoodPoachersBegin",
  "kingswoodPoachersConfirm",
  "kingswoodPoachersSelectSpellbook",
  "kingswoodPoachersResolve",
  "kingswoodPoachersCancel",
  // Searing Truth
  "searingTruthBegin",
  "searingTruthTarget",
  "searingTruthResolve",
  "searingTruthCancel",
  "searingTruthConfirm",
  // Interrogator
  "interrogatorTrigger",
  "interrogatorResolve",
  // Garden of Eden
  "gardenOfEdenRegister",
  "gardenOfEdenUnregister",
  // Kettletop Leprechaun. The Deathrite draws from the owner's private atlas,
  // so when the opponent destroys it the killer's client hands the trigger to
  // the owner with kettletopDeathriteRequest.
  "kettletopDeathriteRequest",
  "kettletopBegin",
  "kettletopResolve",
  "kettletopCancel",
  // Pigs of the Sounder / Squeakers. Same owner-handoff as Kettletop: the
  // reveal reads the owner's private spellbook.
  "pigsDeathriteRequest",
  "pigsDeathrite",
  "pigsDeathResolve",
  // Feast for Crows
  "feastForCrowsBegin",
  "feastForCrowsName",
  "feastForCrowsResolve",
  "feastForCrowsCancel",
  // Merlin
  "merlinRegister",
  "merlinUnregister",
  "merlinCast",
  // Selfsame Simulacrum
  "selfsameSimulacrumBegin",
  "selfsameSimulacrumSelect",
  "selfsameSimulacrumResolve",
  "selfsameSimulacrumCancel",
  // Waveshaper
  "waveshaperBegin",
  "waveshaperResolve",
  "waveshaperCancel",
  // Frontier Settlers
  "frontierSettlersBegin",
  "frontierSettlersSelectTarget",
  "frontierSettlersResolve",
  "frontierSettlersCancel",
  // Auto-resolve confirmation
  "autoResolveBegin",
  "autoResolveConfirm",
  "autoResolveCancel",
  // Sea Raider / Captain Baldassare piracy reveal
  "piracyTrigger",
  // Generic reveal overlay (GameToolbox "show opponent" flows)
  "revealCards",
  // Combat damage assignment sub-step
  "combatAssign",
  // Generic magic cast: confirmation sub-step
  "magicConfirm",
]);

export function isResolverRelayMessage(type: string | null): boolean {
  return !!type && RESOLVER_RELAY_MESSAGE_TYPES.has(type);
}
