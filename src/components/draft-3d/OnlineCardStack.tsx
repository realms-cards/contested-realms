"use client";

import { useMemo, useState } from "react";
import type { Position3D } from "@/types/draft-3d-events";
import OnlineCard3D from "./OnlineCard3D";

export interface CardInStack {
  cardId: string;
  slug: string;
  ownedByPlayer?: string;
  isVisible?: boolean;
  isPickable?: boolean;
}

export interface OnlineCardStackProps {
  cards: CardInStack[];
  stackId: string;
  basePosition: Position3D;
  stackType: 'pack' | 'hand' | 'picked' | 'pool';
  
  // Online context
  sessionId: string;
  playerId: string;
  
  // Layout options
  fanDirection?: 'horizontal' | 'vertical' | 'none';
  fanSpread?: number; // Distance between cards in a fan
  stackSpread?: number; // Vertical spacing between stacked cards
  
  // Interaction callbacks
  onCardPick?: (cardId: string, stackId: string) => void;
  onCardInspect?: (cardId: string) => void;
  onStackInteraction?: (interaction: {
    type: 'pick' | 'pass' | 'reorder' | 'inspect';
    cardIds: string[];
    fromStack: string;
    toStack?: string;
  }) => void;
  
  // Visual options
  maxVisibleCards?: number;
  showCardCount?: boolean;
  disabled?: boolean;
}

export default function OnlineCardStack({
  cards,
  stackId,
  basePosition,
  stackType,
  sessionId,
  playerId,
  fanDirection = 'none',
  fanSpread = 0.05,
  stackSpread = 0.002,
  onCardPick,
  onCardInspect,
  onStackInteraction,
  maxVisibleCards,
  showCardCount = false,
  disabled = false,
}: OnlineCardStackProps) {
  // Hover state for card highlighting
  const [, setHoveredCard] = useState<string | null>(null); // placeholder for future hover UI

  // Calculate card positions based on stack type and layout
  const cardPositions = useMemo(() => {
    if (cards.length === 0) return [];

    const positions: Array<{ card: CardInStack; position: Position3D; stackIndex: number }> = [];
    
    switch (stackType) {
      case 'pack': {
        // Pack cards are fanned horizontally
        cards.forEach((card, index) => {
          const fanOffset = fanDirection === 'horizontal' ? index * fanSpread : 0;
          const stackOffset = index * stackSpread;
          
          positions.push({
            card,
            position: {
              x: basePosition.x + fanOffset,
              y: basePosition.y + stackOffset,
              z: basePosition.z
            },
            stackIndex: index
          });
        });
        break;
      }
      
      case 'hand': {
        // Hand cards are fanned in an arc
        const totalCards = cards.length;
        const maxArcAngle = Math.PI / 3; // 60 degrees max arc
        const arcRadius = 0.8;
        
        cards.forEach((card, index) => {
          let angle = 0;
          let radius = 0;
          
          if (totalCards > 1) {
            // Spread cards across arc
            const normalizedIndex = (index - (totalCards - 1) / 2) / (totalCards - 1);
            angle = normalizedIndex * maxArcAngle;
            radius = arcRadius;
          }
          
          const stackOffset = index * stackSpread;
          
          positions.push({
            card,
            position: {
              x: basePosition.x + Math.sin(angle) * radius,
              y: basePosition.y + stackOffset,
              z: basePosition.z + Math.cos(angle) * radius
            },
            stackIndex: index
          });
        });
        break;
      }
      
      case 'picked': {
        // Picked cards are stacked neatly
        cards.forEach((card, index) => {
          const stackOffset = index * (stackSpread * 2); // Slightly more spacing for picked cards
          
          positions.push({
            card,
            position: {
              x: basePosition.x,
              y: basePosition.y + stackOffset,
              z: basePosition.z
            },
            stackIndex: index
          });
        });
        break;
      }
      
      case 'pool': {
        // Pool cards are arranged in a grid
        const cardsPerRow = 5;
        const cardWidth = 0.06;
        const cardHeight = 0.09;
        
        cards.forEach((card, index) => {
          const row = Math.floor(index / cardsPerRow);
          const col = index % cardsPerRow;
          const stackOffset = index * stackSpread;
          
          positions.push({
            card,
            position: {
              x: basePosition.x + (col - (cardsPerRow - 1) / 2) * cardWidth,
              y: basePosition.y + stackOffset,
              z: basePosition.z + row * cardHeight
            },
            stackIndex: index
          });
        });
        break;
      }
    }
    
    return positions;
  }, [cards, basePosition, stackType, fanDirection, fanSpread, stackSpread]);

  // Filter visible cards based on maxVisibleCards setting
  const visiblePositions = useMemo(() => {
    if (!maxVisibleCards || cardPositions.length <= maxVisibleCards) {
      return cardPositions;
    }
    
    // Show the top N cards
    return cardPositions.slice(-maxVisibleCards);
  }, [cardPositions, maxVisibleCards]);

  const handleCardHover = (hovering: boolean, cardId: string) => {
    setHoveredCard(hovering ? cardId : null);
  };

  const handleCardPick = (cardId: string) => {
    onCardPick?.(cardId, stackId);
    
    // Send stack interaction event
    onStackInteraction?.({
      type: 'pick',
      cardIds: [cardId],
      fromStack: stackId,
    });
  };

  const handleCardInspect = (cardId: string) => {
    onCardInspect?.(cardId);
    
    // Send stack interaction event
    onStackInteraction?.({
      type: 'inspect',
      cardIds: [cardId],
      fromStack: stackId,
    });
  };

  // Count display for stacks with many cards
  const hiddenCardCount = cards.length - visiblePositions.length;

  return (
    <group>
      {/* Render visible cards */}
      {visiblePositions.map(({ card, position, stackIndex }) => (
        <OnlineCard3D
          key={`${stackId}-${card.cardId}`}
          slug={card.slug}
          cardId={card.cardId}
          isSite={false}
          x={position.x}
          y={position.y}
          z={position.z}
          sessionId={sessionId}
          playerId={playerId}
          ownedByPlayer={card.ownedByPlayer}
          isPickable={card.isPickable && !disabled}
          isVisible={card.isVisible}
          stackIndex={stackIndex}
          totalInStack={cards.length}
          baseRenderOrder={1000 + stackIndex}
          onPick={handleCardPick}
          onInspect={handleCardInspect}
          onHoverChange={handleCardHover}
          disabled={disabled}
        />
      ))}
      
      {/* Stack count indicator for large stacks */}
      {showCardCount && cards.length > 1 && (
        <group position={[basePosition.x + 0.08, basePosition.y + 0.01, basePosition.z + 0.08]}>
          {/* Background for count */}
          <mesh rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.04, 0.02]} />
            <meshBasicMaterial
              color={0x000000}
              transparent
              opacity={0.7}
              depthWrite={false}
            />
          </mesh>

          {/* Visual indicator for count */}
          <mesh position={[0, 0.001, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.02, 0.01]} />
            <meshBasicMaterial
              color={0xffffff}
              transparent
              opacity={0.9}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
      
      {/* Hidden card count indicator */}
      {hiddenCardCount > 0 && (
        <group position={[basePosition.x - 0.08, basePosition.y + 0.01, basePosition.z - 0.08]}>
          <mesh rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.06, 0.02]} />
            <meshBasicMaterial
              color={0x444444}
              transparent
              opacity={0.8}
              depthWrite={false}
            />
          </mesh>
          
          {/* Visual indicator for hidden cards */}
          <mesh position={[0, 0.001, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.04, 0.01]} />
            <meshBasicMaterial
              color={0xaaaaaa}
              transparent
              opacity={0.9}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
      
      {/* Stack interaction area for drag-and-drop */}
      <mesh
        position={[basePosition.x, basePosition.y - 0.001, basePosition.z]}
        rotation-x={-Math.PI / 2}
        userData={{
          stackId,
          stackType,
          acceptsCards: stackType !== 'pack', // Packs don't accept dropped cards
        }}
      >
        <planeGeometry args={[0.2, 0.3]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}
