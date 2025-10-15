# Tutorial Bot Integration

Guide for integrating beginner-friendly CPU opponents into tutorial/practice modes.

## Overview

This example demonstrates how to spawn a tutorial bot with adjustable difficulty for teaching new players the game. Tutorial bots use reduced beam width, shallower search depth, and exploration (random moves) to create a more forgiving opponent.

---

## Configuration

### Tutorial Bot Theta

Create `data/bots/params/tutorial-easy.json`:

```json
{
  "meta": {
    "id": "tutorial/easy",
    "description": "Beginner-friendly bot with reduced strength",
    "difficulty": "easy"
  },
  "search": {
    "beamWidth": 4,        // Reduced from 8 (explores fewer options)
    "maxDepth": 2,         // Reduced from 3 (less lookahead)
    "budgetMs": 30,        // Reduced from 60 (faster, less thorough)
    "gamma": 0.5           // Lower discount (less forward planning)
  },
  "exploration": {
    "epsilon_root": 0.2    // 20% random moves (makes mistakes)
  },
  "weights": {
    "w_life": 0.8,
    "w_lethal_now": 8.0,   // Reduced from 10.0 (may miss lethal)
    "w_atk": 0.4,
    "w_hp": 0.2,
    "w_hand": 0.3,
    "w_sites": 1.5,        // Reduced from 2.0 (slower mana base)
    "w_board_development": 0.6,
    "w_threat_deployment": 0.4,
    "w_life_pressure": 0.8  // Reduced from 1.2 (less aggressive)
  }
}
```

### Difficulty Levels

| Difficulty | beamWidth | maxDepth | epsilon | weights |
|------------|-----------|----------|---------|---------|
| **Easy**   | 4         | 2        | 0.2     | Reduced aggression |
| **Medium** | 6         | 2        | 0.1     | Moderate weights |
| **Hard**   | 8         | 3        | 0.05    | Full weights |
| **Expert** | 16        | 4        | 0       | Full weights, extended search |

---

## Server-Side Integration

### Spawn Tutorial Bot

```typescript
// server/tutorialBot.ts
import { BotClient } from '../bots/headless-bot-client';
import fs from 'fs';
import path from 'path';

export async function spawnTutorialBot(
  lobbyId: string,
  difficulty: 'easy' | 'medium' | 'hard' = 'easy'
) {
  // Load appropriate theta
  const thetaPath = path.join(
    process.cwd(),
    'data/bots/params',
    `tutorial-${difficulty}.json`
  );

  let theta;
  try {
    theta = JSON.parse(fs.readFileSync(thetaPath, 'utf8'));
  } catch (e) {
    console.warn(`Failed to load ${difficulty} theta, using defaults`);
    theta = null;
  }

  const bot = new BotClient({
    serverUrl: process.env.SERVER_URL || 'http://localhost:3010',
    displayName: `Tutorial Bot (${difficulty})`,
    playerId: `tutorial_${difficulty}_${Math.random().toString(36).slice(2, 8)}`,
    lobbyId,
    engineMode: 'evaluate', // Deterministic within epsilon constraints
    aiEnabled: true,
    theta,
  });

  await bot.start();

  return {
    botId: bot.playerId,
    difficulty,
    cleanup: () => bot.stop(),
  };
}
```

### API Route

```typescript
// src/app/api/tutorial/spawn-bot/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { spawnTutorialBot } from '@/server/tutorialBot';

export async function POST(req: NextRequest) {
  const { lobbyId, difficulty } = await req.json();

  if (!lobbyId) {
    return NextResponse.json(
      { error: 'lobbyId required' },
      { status: 400 }
    );
  }

  try {
    const bot = await spawnTutorialBot(
      lobbyId,
      difficulty || 'easy'
    );

    return NextResponse.json({
      success: true,
      botId: bot.botId,
      difficulty: bot.difficulty,
    });
  } catch (error) {
    console.error('Failed to spawn tutorial bot:', error);
    return NextResponse.json(
      { error: 'Failed to spawn bot' },
      { status: 500 }
    );
  }
}
```

---

## Client-Side UI Components

### Tutorial Bot Opponent Component

```typescript
// src/components/tutorial/TutorialBotOpponent.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

interface TutorialBotOpponentProps {
  lobbyId: string;
  onBotSpawned?: (botId: string) => void;
}

export function TutorialBotOpponent({
  lobbyId,
  onBotSpawned,
}: TutorialBotOpponentProps) {
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [isSpawning, setIsSpawning] = useState(false);
  const [botActive, setBotActive] = useState(false);

  const spawnBot = async () => {
    setIsSpawning(true);
    try {
      const response = await fetch('/api/tutorial/spawn-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lobbyId, difficulty }),
      });

      const data = await response.json();

      if (data.success) {
        setBotActive(true);
        onBotSpawned?.(data.botId);
      } else {
        console.error('Failed to spawn bot:', data.error);
      }
    } catch (error) {
      console.error('Error spawning bot:', error);
    } finally {
      setIsSpawning(false);
    }
  };

  return (
    <div className="tutorial-bot-panel">
      <h3>Practice Against AI</h3>

      <div className="difficulty-selector">
        <label>Bot Difficulty:</label>
        <Select
          value={difficulty}
          onValueChange={(val) => setDifficulty(val as any)}
          disabled={botActive || isSpawning}
        >
          <option value="easy">Easy - Great for learning</option>
          <option value="medium">Medium - Balanced challenge</option>
          <option value="hard">Hard - Competitive play</option>
        </Select>
      </div>

      <Button
        onClick={spawnBot}
        disabled={botActive || isSpawning}
        className="spawn-bot-button"
      >
        {isSpawning ? (
          <>
            <LoadingSpinner />
            <span>Spawning Bot...</span>
          </>
        ) : botActive ? (
          <>
            <CheckIcon />
            <span>Bot Active</span>
          </>
        ) : (
          'Add AI Opponent'
        )}
      </Button>

      {botActive && (
        <div className="bot-status">
          <StatusIndicator status="active" />
          <span>Tutorial Bot ({difficulty}) is ready</span>
        </div>
      )}

      <div className="bot-info">
        <h4>What to expect:</h4>
        <ul>
          <li>
            <strong>Easy:</strong> Bot makes occasional mistakes and plays slower. Perfect for
            learning the rules.
          </li>
          <li>
            <strong>Medium:</strong> Bot plays reasonably well but isn't optimally aggressive.
            Good for practicing strategies.
          </li>
          <li>
            <strong>Hard:</strong> Bot plays competitively with full strategic awareness. Tests
            your skills.
          </li>
        </ul>
      </div>
    </div>
  );
}

// Utility components
function LoadingSpinner() {
  return <div className="spinner animate-spin">⏳</div>;
}

function CheckIcon() {
  return <div className="check-icon">✓</div>;
}

function StatusIndicator({ status }: { status: 'active' | 'inactive' }) {
  return (
    <div
      className={`status-dot ${status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`}
    />
  );
}
```

### Styles

```css
/* src/components/tutorial/TutorialBotOpponent.css */
.tutorial-bot-panel {
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.difficulty-selector {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 1rem 0;
}

.spawn-bot-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  font-weight: 600;
}

.bot-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  padding: 0.75rem;
  background: rgba(34, 197, 94, 0.1);
  border-radius: 4px;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}

.bot-info {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.bot-info h4 {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.bot-info ul {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.bot-info li {
  font-size: 0.875rem;
  line-height: 1.5;
}

.bot-info strong {
  font-weight: 600;
  color: var(--primary-color);
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
```

---

## Usage in Tutorial Flow

### Tutorial Screen Integration

```typescript
// src/app/tutorial/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { TutorialBotOpponent } from '@/components/tutorial/TutorialBotOpponent';
import { useLobby } from '@/hooks/useLobby';

export default function TutorialPage() {
  const [step, setStep] = useState<'intro' | 'setup' | 'play'>('intro');
  const { lobbyId, createLobby } = useLobby();
  const [botSpawned, setBotSpawned] = useState(false);

  useEffect(() => {
    if (step === 'setup' && !lobbyId) {
      createLobby({ name: 'Tutorial Match', visibility: 'private' });
    }
  }, [step]);

  const handleBotSpawned = (botId: string) => {
    console.log('Bot spawned:', botId);
    setBotSpawned(true);
  };

  const handleStartMatch = () => {
    // Transition to play mode
    setStep('play');
  };

  return (
    <div className="tutorial-container">
      {step === 'intro' && (
        <div className="tutorial-intro">
          <h1>Welcome to Sorcery Tutorial</h1>
          <p>Learn the basics by playing against an AI opponent.</p>
          <Button onClick={() => setStep('setup')}>
            Start Tutorial
          </Button>
        </div>
      )}

      {step === 'setup' && lobbyId && (
        <div className="tutorial-setup">
          <h2>Match Setup</h2>
          <TutorialBotOpponent
            lobbyId={lobbyId}
            onBotSpawned={handleBotSpawned}
          />

          {botSpawned && (
            <Button onClick={handleStartMatch} className="start-match-btn">
              Begin Match
            </Button>
          )}
        </div>
      )}

      {step === 'play' && (
        <div className="tutorial-play">
          {/* Render game interface with tutorial hints */}
          <GameInterface lobbyId={lobbyId} tutorialMode />
        </div>
      )}
    </div>
  );
}
```

---

## Bot Thinking UI

Show bot decision-making process to help players learn:

```typescript
// src/components/tutorial/BotThinkingIndicator.tsx
'use client';

import { useEffect, useState } from 'react';

interface BotThinkingIndicatorProps {
  isActive: boolean;
}

export function BotThinkingIndicator({ isActive }: BotThinkingIndicatorProps) {
  const [dots, setDots] = useState(1);

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setDots((prev) => (prev % 3) + 1);
    }, 500);

    return () => clearInterval(interval);
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div className="bot-thinking-indicator">
      <div className="bot-avatar animate-pulse">
        <span className="robot-icon">🤖</span>
      </div>
      <div className="thinking-text">
        <span>Bot is thinking</span>
        <span className="dots">{'.'.repeat(dots)}</span>
      </div>
      <div className="thinking-animation">
        <div className="beam" />
        <div className="beam" />
        <div className="beam" />
      </div>
    </div>
  );
}
```

---

## Testing

### Verify Bot Behavior

```typescript
// tests/tutorial/bot-difficulty.test.ts
import { describe, it, expect } from 'vitest';
import { spawnTutorialBot } from '@/server/tutorialBot';

describe('Tutorial Bot Difficulty', () => {
  it('should spawn easy bot with reduced parameters', async () => {
    const bot = await spawnTutorialBot('test-lobby', 'easy');

    expect(bot.botId).toMatch(/^tutorial_easy_/);
    expect(bot.difficulty).toBe('easy');
  });

  it('should spawn medium bot with moderate parameters', async () => {
    const bot = await spawnTutorialBot('test-lobby', 'medium');

    expect(bot.difficulty).toBe('medium');
  });

  it('should spawn hard bot with full parameters', async () => {
    const bot = await spawnTutorialBot('test-lobby', 'hard');

    expect(bot.difficulty).toBe('hard');
  });
});
```

---

## Advanced: Hint System

Show what the bot is considering:

```typescript
// Enable hint logging in bot engine
const bot = new BotClient({
  // ... other options
  engineMode: 'tutorial', // New mode with verbose logging
  onDecision: (decision) => {
    // decision contains candidate details
    sendHintToClient(decision);
  },
});

// Client displays hints
function BotDecisionHint({ decision }) {
  return (
    <div className="bot-hint">
      <p>Bot is considering:</p>
      <ul>
        {decision.candidates.slice(0, 3).map((c, i) => (
          <li key={i}>
            {c.action} (score: {c.score.toFixed(1)})
          </li>
        ))}
      </ul>
      <p className="hint-text">
        The bot chose to <strong>{decision.chosen.action}</strong> because it
        has the highest score.
      </p>
    </div>
  );
}
```

---

## References

- **Bot Engine**: `bots/engine/README.md`
- **Bot Client**: `bots/headless-bot-client.js`
- **Champion Theta**: `data/bots/params/champion.json`
- **Difficulty Presets**: Create `tutorial-easy.json`, `tutorial-medium.json`, `tutorial-hard.json`

---

**Last Updated**: 2025-10-15
**Status**: Example implementation - ready for integration
