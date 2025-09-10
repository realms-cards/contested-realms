"use client";

import { useEffect, useCallback, useState, useMemo } from "react";
import { useDraft3DTransport } from "@/lib/hooks/useDraft3DTransport";
import type { GameTransport } from "@/lib/net/transport";
import { useDraft3DSession, useDraft3DPlayers } from "@/lib/stores/draft-3d-online";
import type { Position3D } from "@/types/draft-3d-events";
import OnlineCardStack from "./OnlineCardStack";
import type { CardInStack } from "./OnlineCardStack";

export interface OnlineDraftSessionProps {
  // Session context
  sessionId: string;
  playerId: string;
  transport: GameTransport;
  
  // Draft state from existing system
  draftState?: {
    currentPacks?: unknown[][];
    pickedCards?: Record<string, unknown[]>;
    phase?: string;
    waitingFor?: string[];
    timeRemaining?: number;
  };
  
  // Camera and layout
  cameraPosition?: Position3D;
  cameraTarget?: Position3D;
  
  // Event handlers
  onCardPick?: (cardId: string) => void;
  onCardInspect?: (cardId: string) => void;
  onDraftComplete?: (finalDeck: unknown) => void;
  onError?: (error: string) => void;
}

// Safely extract a slug string from unknown card-like inputs
function extractSlug(raw: unknown, fallback: string): string {
  if (typeof raw === 'object' && raw !== null && 'slug' in (raw as Record<string, unknown>)) {
    const s = (raw as { slug?: unknown }).slug;
    if (typeof s === 'string' && s.length > 0) return s;
  }
  return fallback;
}

export default function OnlineDraftSession({
  sessionId,
  playerId,
  transport,
  draftState,
  cameraPosition = { x: 0, y: 5, z: 10 },
  cameraTarget = { x: 0, y: 0, z: 0 },
  onCardPick,
  onCardInspect,
  onDraftComplete,
  onError,
}: OnlineDraftSessionProps) {
  const [currentPack, setCurrentPack] = useState<CardInStack[]>([]);
  const [pickedCards, setPickedCards] = useState<CardInStack[]>([]);
  const [otherPlayersPacks, setOtherPlayersPacks] = useState<Record<string, CardInStack[]>>({});
  
  // Initialize transport integration
  const {
    isConnected,
    sendCardPreview,
    sendStackInteraction,
    activePreviews,
    playerStates
  } = useDraft3DTransport({
    transport,
    sessionId,
    playerId,
    onError: (error) => {
      console.error('[OnlineDraftSession] Transport error:', error);
      onError?.(String(error));
    }
  });
  
  // Session and player state management
  const { joinSession, leaveSession } = useDraft3DSession();
  const { currentPlayerId } = useDraft3DPlayers();
  
  // Initialize session on mount
  useEffect(() => {
    if (sessionId && playerId && transport) {
      joinSession(sessionId, playerId);
    }
    
    return () => {
      leaveSession();
    };
  }, [sessionId, playerId, transport, joinSession, leaveSession]);
  
  // Sync with existing draft state
  useEffect(() => {
    if (!draftState) return;
    
    // Convert current pack to CardInStack format
    if (draftState.currentPacks && draftState.currentPacks[0]) {
      const packCards: CardInStack[] = (draftState.currentPacks[0] as unknown[]).map((raw, index) => {
        const slug = extractSlug(raw, `unknown-${index}`);
        return {
          cardId: slug || `card-${index}`,
          slug,
          ownedByPlayer: undefined, // Pack cards aren't owned yet
          isVisible: true,
          isPickable: draftState.waitingFor?.includes(playerId) || false,
        };
      });
      setCurrentPack(packCards);
    }
    
    // Convert picked cards
    if (draftState.pickedCards && draftState.pickedCards[playerId]) {
      const picked: CardInStack[] = (draftState.pickedCards[playerId] as unknown[]).map((raw, index) => {
        const slug = extractSlug(raw, `unknown-${index}`);
        return {
          cardId: slug || `picked-${index}`,
          slug,
          ownedByPlayer: playerId,
          isVisible: true,
          isPickable: false, // Already picked
        };
      });
      setPickedCards(picked);
    }
    
    // Set other players' visible packs (if draft phase allows it)
    if (draftState.phase === 'complete' && draftState.pickedCards) {
      const otherPacks: Record<string, CardInStack[]> = {};
      
      Object.entries(draftState.pickedCards).forEach(([pId, cards]) => {
        if (pId !== playerId) {
          otherPacks[pId] = (cards as unknown[]).map((raw, index) => {
            const slug = extractSlug(raw, `unknown-${index}`);
            return {
              cardId: slug || `other-${pId}-${index}`,
              slug,
              ownedByPlayer: pId,
              isVisible: true,
              isPickable: false,
            };
          });
        }
      });
      
      setOtherPlayersPacks(otherPacks);
    }
  }, [draftState, playerId]);
  
  // Calculate stack positions around the table
  const stackPositions = useMemo(() => {
    const playerCount = playerStates.size || 2;
    const radius = 1.2;
    const angleStep = (2 * Math.PI) / playerCount;
    
    const positions: Record<string, Position3D> = {};
    
    // Current player's positions
    positions.currentPack = { x: 0, y: 0, z: -0.8 }; // In front of player
    positions.pickedCards = { x: 0.6, y: 0, z: -0.4 }; // To the right
    
    // Other players' positions around the table
    Array.from(playerStates.keys()).forEach((pId, index) => {
      if (pId !== playerId) {
        const angle = index * angleStep;
        positions[`player-${pId}`] = {
          x: Math.sin(angle) * radius,
          y: 0,
          z: Math.cos(angle) * radius,
        };
      }
    });
    
    return positions;
  }, [playerStates, playerId]);
  
  const handleCardPick = useCallback((cardId: string, stackId: string) => {
    // Send pick action through existing draft system
    onCardPick?.(cardId);
    
    // Move card from current pack to picked cards
    const pickedCard = currentPack.find(card => card.cardId === cardId);
    if (pickedCard) {
      setCurrentPack(prev => prev.filter(card => card.cardId !== cardId));
      setPickedCards(prev => [...prev, { ...pickedCard, ownedByPlayer: playerId, isPickable: false }]);
    }
  }, [currentPack, playerId, onCardPick]);
  
  const handleCardInspect = useCallback((cardId: string) => {
    onCardInspect?.(cardId);
  }, [onCardInspect]);
  
  const handleStackInteraction = useCallback((interaction: {
    type: 'pick' | 'pass' | 'reorder' | 'inspect';
    cardIds: string[];
    fromStack: string;
    toStack?: string;
  }) => {
    console.log('[OnlineDraftSession] Stack interaction:', interaction);
    
    // Handle different interaction types
    switch (interaction.type) {
      case 'pick':
        // Already handled by handleCardPick
        break;
      case 'inspect':
        // Preview card for longer
        if (interaction.cardIds.length > 0) {
          const card = currentPack.find(c => c.cardId === interaction.cardIds[0]);
          if (card) {
            sendCardPreview(card.cardId, 'inspect', { x: 0, y: 0.3, z: -0.5 }, 'high');
          }
        }
        break;
      case 'pass':
        // Pass the entire pack (if supported)
        console.log('Pass action not yet implemented');
        break;
      case 'reorder':
        // Reorder cards in hand (if supported)
        console.log('Reorder action not yet implemented');
        break;
    }
  }, [currentPack, sendCardPreview]);
  
  if (!isConnected) {
    return (
      <group>
        {/* Connection status indicator */}
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.2, 0.05, 0.02]} />
          <meshBasicMaterial color={0xff4444} />
        </mesh>
      </group>
    );
  }
  
  return (
    <group>
      {/* Current player's current pack */}
      {currentPack.length > 0 && (
        <OnlineCardStack
          cards={currentPack}
          stackId="current-pack"
          basePosition={stackPositions.currentPack}
          stackType="pack"
          sessionId={sessionId}
          playerId={playerId}
          fanDirection="horizontal"
          fanSpread={0.08}
          onCardPick={handleCardPick}
          onCardInspect={handleCardInspect}
          onStackInteraction={handleStackInteraction}
          showCardCount={true}
        />
      )}
      
      {/* Current player's picked cards */}
      {pickedCards.length > 0 && (
        <OnlineCardStack
          cards={pickedCards}
          stackId="picked-cards"
          basePosition={stackPositions.pickedCards}
          stackType="picked"
          sessionId={sessionId}
          playerId={playerId}
          fanDirection="none"
          maxVisibleCards={5}
          onCardInspect={handleCardInspect}
          onStackInteraction={handleStackInteraction}
          showCardCount={true}
        />
      )}
      
      {/* Other players' packs (visible in complete phase) */}
      {Object.entries(otherPlayersPacks).map(([pId, cards]) => (
        <OnlineCardStack
          key={`player-${pId}-pack`}
          cards={cards}
          stackId={`player-${pId}-pack`}
          basePosition={stackPositions[`player-${pId}`] || { x: 0, y: 0, z: 0 }}
          stackType="pool"
          sessionId={sessionId}
          playerId={playerId}
          maxVisibleCards={10}
          onCardInspect={handleCardInspect}
          onStackInteraction={handleStackInteraction}
          showCardCount={true}
          disabled={true} // Can't interact with other players' cards
        />
      ))}
      
      {/* Preview indicators for cards being viewed by other players */}
      {Array.from(activePreviews.values()).map(preview => {
        if (preview.playerId === playerId || !preview.isActive) return null;
        
        return (
          <group key={preview.previewId} position={[preview.position.x, preview.position.y + 0.05, preview.position.z]}>
            {/* Floating indicator showing another player is previewing this card */}
            <mesh rotation-x={-Math.PI / 2}>
              <planeGeometry args={[0.03, 0.03]} />
              <meshBasicMaterial
                color={preview.previewType === 'inspect' ? 0xffaa00 : 0x4488ff}
                transparent
                opacity={0.8}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}
      
      {/* Draft status display */}
      <group position={[0, 0.2, -1.2]}>
        {/* Timer display */}
        {draftState?.timeRemaining && draftState.timeRemaining > 0 && (
          <mesh rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.3, 0.05]} />
            <meshBasicMaterial
              color={draftState.timeRemaining < 10 ? 0xff4444 : 0x44aa44}
              transparent
              opacity={0.7}
              depthWrite={false}
            />
          </mesh>
        )}
        
        {/* Waiting indicator */}
        {draftState?.waitingFor && !draftState.waitingFor.includes(playerId) && (
          <mesh position={[0, 0.01, 0.1]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.2, 0.03]} />
            <meshBasicMaterial
              color={0xaaaa44}
              transparent
              opacity={0.6}
              depthWrite={false}
            />
          </mesh>
        )}
      </group>
    </group>
  );
}