## ADDED Requirements

### Requirement: Per-Socket Rate Limits
The server SHALL enforce per-socket token-bucket limits for chat, cursor, and generic messages with configurable ceilings.

#### Scenario: Chat rate limit
- **WHEN** a client sends more than 5 chat messages within 10 seconds
- **THEN** the server responds with an error `{ code: "rate_limited" }` for excess messages

#### Scenario: Cursor rate limit
- **WHEN** a client sends more than 30 cursor updates in 1 second
- **THEN** the server silently drops excess updates and does not broadcast them

#### Scenario: Message rate limit
- **WHEN** a client sends more than 50 generic messages within 10 seconds
- **THEN** the server silently drops excess messages

### Requirement: Configurable Limits
All limits SHALL be configurable via environment variables with safe defaults.

#### Scenario: Override limits via env
- **WHEN** env vars are set (e.g., `RATE_LIMIT_CHAT_PER_10S=10`)
- **THEN** the server applies the new ceilings without code changes
