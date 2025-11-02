## ADDED Requirements

### Requirement: WebSocket Proxy Stickiness and CORS
The edge proxy SHALL preserve sticky sessions and allow credentialed cross-origin WebSocket connections.

- The proxy SHALL set `Access-Control-Allow-Credentials: true` for the WebSocket origin.
- The proxy SHALL set `Access-Control-Allow-Origin` to the app domain (not `*`).
- The proxy load balancer policy SHALL use a cookie for stickiness and persist it across reconnects.
- The proxy SHALL set read_timeout and write_timeout to at least 3 minutes for WebSocket routes.
- The proxy SHOULD flush responses immediately (or equivalent of `flush_interval -1`).

#### Scenario: Credentialed cross-origin handshake
- WHEN the browser connects to the WS domain from the app domain
- THEN the proxy SHALL respond with credentials allowed and a non-wildcard ACAO header

#### Scenario: Sticky session across reconnects
- WHEN a client reconnects during the same browser session
- THEN the proxy SHALL route the connection to the same upstream instance using the stickiness cookie

#### Scenario: Long-lived connection support
- WHEN a draft session remains active for > 10 minutes
- THEN the proxy SHALL NOT close the WebSocket due to read/write timeouts
