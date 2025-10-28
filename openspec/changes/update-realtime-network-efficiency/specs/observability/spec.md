## ADDED Requirements

### Requirement: Hot Signal Metrics
The system SHALL expose Prometheus counters/gauges for hot realtime signals and persistence buffers.

#### Scenario: Cursor/chat metrics
- **WHEN** 100 cursor events are processed and broadcast
- **THEN** `cursor_recv_total` increases by 100 and `cursor_sent_total` increases by the distribution of recipients
- **AND** chat send/recv counters reflect observed traffic

#### Scenario: Lobby broadcast metrics
- **WHEN** lobby updates are broadcast 10 times in 1 minute
- **THEN** `lobbies_updated_sent_total` increases by 10

#### Scenario: Rate limit metrics
- **WHEN** messages are dropped due to rate limits
- **THEN** `rate_limit_hits_total{type=...}` increments accordingly

#### Scenario: Persistence buffer metrics
- **WHEN** a flush occurs
- **THEN** `persist_buffer_flush_total` increments, `persist_buffer_items_total` reflects items flushed, and `persist_flush_duration_ms` records latency
