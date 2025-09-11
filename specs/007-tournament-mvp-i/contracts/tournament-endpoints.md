# Tournament API Endpoints

**Base URL**: `/api/tournaments`  
**Authentication**: Required (Next-Auth session)  
**Content-Type**: `application/json`

## Tournament Management

### GET /api/tournaments
**Purpose**: List available tournaments  
**Authentication**: Required  
**Query Parameters**:
- `status?: string` - Filter by tournament status
- `format?: string` - Filter by tournament format
- `limit?: number` - Maximum tournaments to return (default: 20)
- `offset?: number` - Pagination offset (default: 0)

**Response**: `200 OK`
```typescript
{
  tournaments: TournamentResponse[],
  total: number,
  hasMore: boolean
}
```

**Error Responses**:
- `401 Unauthorized` - Not authenticated
- `422 Unprocessable Entity` - Invalid query parameters

### POST /api/tournaments
**Purpose**: Create new tournament (FR-002)  
**Authentication**: Required  
**Request Body**: `CreateTournamentRequest`

**Response**: `201 Created`
```typescript
TournamentResponse
```

**Error Responses**:
- `401 Unauthorized` - Not authenticated
- `422 Unprocessable Entity` - Invalid tournament data
- `403 Forbidden` - Tournament feature disabled

### GET /api/tournaments/[id]
**Purpose**: Get tournament details  
**Authentication**: Required  
**Path Parameters**:
- `id: string` - Tournament UUID

**Response**: `200 OK`
```typescript
TournamentResponse & {
  registrations: TournamentRegistrationResponse[],
  currentRound?: TournamentRoundResponse
}
```

**Error Responses**:
- `401 Unauthorized` - Not authenticated
- `404 Not Found` - Tournament not found

### PATCH /api/tournaments/[id]
**Purpose**: Update tournament settings (organizer only)  
**Authentication**: Required  
**Path Parameters**:
- `id: string` - Tournament UUID
**Request Body**: `UpdateTournamentRequest`

**Response**: `200 OK`
```typescript
TournamentResponse
```

**Error Responses**:
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not tournament organizer or tournament not in registering phase
- `404 Not Found` - Tournament not found
- `422 Unprocessable Entity` - Invalid update data

### DELETE /api/tournaments/[id]
**Purpose**: Cancel tournament (organizer only)  
**Authentication**: Required  
**Path Parameters**:
- `id: string` - Tournament UUID

**Response**: `200 OK`
```typescript
{ message: "Tournament cancelled successfully" }
```

**Error Responses**:
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not tournament organizer
- `404 Not Found` - Tournament not found
- `409 Conflict` - Tournament cannot be cancelled in current state

## Tournament Participation

### POST /api/tournaments/[id]/join
**Purpose**: Join tournament (FR-004)  
**Authentication**: Required  
**Path Parameters**:
- `id: string` - Tournament UUID
**Request Body**: `JoinTournamentRequest`

**Response**: `201 Created`
```typescript
TournamentRegistrationResponse
```

**Error Responses**:
- `401 Unauthorized` - Not authenticated
- `404 Not Found` - Tournament not found
- `409 Conflict` - Tournament full or player already registered
- `422 Unprocessable Entity` - Tournament not accepting registrations

### DELETE /api/tournaments/[id]/leave
**Purpose**: Leave tournament (before preparation phase)  
**Authentication**: Required  
**Path Parameters**:
- `id: string` - Tournament UUID

**Response**: `200 OK`
```typescript
{ message: "Left tournament successfully" }
```

**Error Responses**:
- `401 Unauthorized` - Not authenticated
- `404 Not Found` - Tournament or registration not found
- `409 Conflict` - Cannot leave tournament in current phase

### POST /api/tournaments/[id]/preparation
**Purpose**: Submit preparation phase completion (FR-006, FR-007, FR-008)  
**Authentication**: Required  
**Path Parameters**:
- `id: string` - Tournament UUID
**Request Body**: `SubmitPreparationRequest`

**Response**: `200 OK`
```typescript
TournamentRegistrationResponse
```

**Error Responses**:
- `401 Unauthorized` - Not authenticated
- `404 Not Found` - Tournament or registration not found
- `409 Conflict` - Tournament not in preparation phase
- `422 Unprocessable Entity` - Invalid preparation data

## Tournament Statistics

### GET /api/tournaments/[id]/statistics
**Purpose**: Get tournament statistics and standings (FR-011, FR-012)  
**Authentication**: Required  
**Path Parameters**:
- `id: string` - Tournament UUID

**Response**: `200 OK`
```typescript
TournamentStatisticsResponse
```

**Error Responses**:
- `401 Unauthorized` - Not authenticated
- `404 Not Found` - Tournament not found

### GET /api/tournaments/[id]/rounds
**Purpose**: Get tournament rounds and matches  
**Authentication**: Required  
**Path Parameters**:
- `id: string` - Tournament UUID
**Query Parameters**:
- `round?: number` - Specific round number

**Response**: `200 OK`
```typescript
TournamentRoundResponse[]
```

**Error Responses**:
- `401 Unauthorized` - Not authenticated
- `404 Not Found` - Tournament not found

## Tournament Administration

### POST /api/tournaments/[id]/start-preparation
**Purpose**: Start preparation phase (organizer only) (FR-005)  
**Authentication**: Required  
**Path Parameters**:
- `id: string` - Tournament UUID

**Response**: `200 OK`
```typescript
TournamentResponse
```

**Error Responses**:
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not tournament organizer
- `404 Not Found` - Tournament not found
- `409 Conflict` - Tournament not ready for preparation phase

### POST /api/tournaments/[id]/start-matches
**Purpose**: Start tournament matches (automatic after preparation) (FR-014)  
**Authentication**: Required  
**Path Parameters**:
- `id: string` - Tournament UUID

**Response**: `200 OK`
```typescript
TournamentResponse
```

**Error Responses**:
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not tournament organizer
- `404 Not Found` - Tournament not found
- `409 Conflict` - Preparation phase not completed

### POST /api/tournaments/[id]/next-round
**Purpose**: Start next tournament round (organizer only) (FR-009, FR-010)  
**Authentication**: Required  
**Path Parameters**:
- `id: string` - Tournament UUID

**Response**: `200 OK`
```typescript
TournamentRoundResponse
```

**Error Responses**:
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not tournament organizer
- `404 Not Found` - Tournament not found
- `409 Conflict` - Previous round not completed

## Feature Flag Integration

### GET /api/config/features
**Purpose**: Get feature flag status (FR-001)  
**Authentication**: Required

**Response**: `200 OK`
```typescript
{
  tournaments: {
    enabled: boolean,
    maxConcurrentTournaments?: number,
    supportedFormats?: TournamentFormat[]
  }
}
```

**Error Responses**:
- `401 Unauthorized` - Not authenticated

---

**Contract Status**: Ready for test generation  
**Integration Points**: Socket.io events, feature flags, existing game system