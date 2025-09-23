# Feature Specification: All Players MVP for Online Lobby
 
**Feature Branch**: `008-all-players-mvp`  
**Created**: 2025-09-23  
**Status**: Draft  
**Input**: User description: "ALL-PLAYERS-MVP — list all currently available players in /online/lobby (Friends & Invites), make friend adding manual from the All Players tab, and prioritize players I recently played against at the top of the list."
 
## Execution Flow (main)
```
1. Parse user description from Input
   → If empty: ERROR "No feature description provided"
2. Extract key concepts from description
   → Identify: actors, actions, data, constraints
3. For each unclear aspect:
   → Mark with [NEEDS CLARIFICATION: specific question]
4. Fill User Scenarios & Testing section
   → If no clear user flow: ERROR "Cannot determine user scenarios"
5. Generate Functional Requirements
   → Each requirement must be testable
   → Mark ambiguous requirements
6. Identify Key Entities (if data involved)
7. Run Review Checklist
   → If any [NEEDS CLARIFICATION]: WARN "Spec has uncertainties"
   → If implementation details found: ERROR "Remove tech details"
8. Return: SUCCESS (spec ready for planning)
```
 
---
 
## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers
 
### Section Requirements
- **Mandatory sections**: Must be completed for every feature
- **Optional sections**: Include only when relevant to the feature
- When a section doesn't apply, remove it entirely (don't leave as "N/A")
 
### For AI Generation
When creating this spec from a user prompt:
1. **Mark all ambiguities**: Use [NEEDS CLARIFICATION: specific question] for any assumption you'd need to make
2. **Don't guess**: If the prompt doesn't specify something (e.g., "login system" without auth method), mark it
3. **Think like a tester**: Every vague requirement should fail the "testable and unambiguous" checklist item
4. **Common underspecified areas**:
   - User types and permissions
   - Data retention/deletion policies  
   - Performance targets and scale
   - Error handling behaviors
   - Integration requirements
   - Security/compliance needs
 
---
 
## Clarifications
 
### Session 2025-09-23 20:14
 - Availability: "Currently available" means online and not in a match; presence must be visible (hidden users excluded).
 - Prioritization: Use the last 10 matches to prioritize recent opponents; within that group order by highest frequency, ties broken by most recent match time.
 - Discoverability: Default Visible with a first‑run prompt allowing the user to hide presence; hidden users do not appear in All Players.
 - Identity Display: Show Avatar, Display Name, and a short human‑friendly UserID. Disambiguate duplicate names using Avatar + short UserID.
 - Sorting: Provide a toggle between "Recent first" and "Alphabetical"; remember the user's choice for the session.
 - Listing & Performance: Initially show up to 100 players, then progressively load more (infinite scroll).
 - Search: Search by display name (case‑insensitive).
 - Access: Signed‑in users only may view or interact with the All Players list.
 
 
## User Scenarios & Testing *(mandatory)*
 
### Primary User Story
As a logged-in player visiting the online lobby, I want to browse an All Players list of currently available players and quickly add someone as a friend or invite them to play, so I can reconnect with recent opponents and discover new matches without unwanted auto-friending.
 
### Acceptance Scenarios
1. **Given** I am on the Friends & Invites area of `/online/lobby` with the All Players view visible, **When** the list loads, **Then** I see players who are currently available with their display names and presence state.
2. **Given** I have played a match with Player X within my last 10 matches, **When** I view All Players, **Then** Player X appears before other players (i.e., recent opponents are prioritized at the top).
3. **Given** auto-adding of friends has been disabled, **When** I complete a new match with a previously unknown player, **Then** that player is not added to my Friends list automatically.
4. **Given** I see Player Y in the All Players list and they are not already my friend, **When** I choose Add Friend for Player Y, **Then** Player Y is added to my Friends list and the UI reflects that they are now a friend.
5. **Given** Player Z is already on my Friends list, **When** I attempt to add Player Z from the All Players list, **Then** the system prevents creating a duplicate friend and communicates that they are already a friend.
6. **Given** Player W is shown as available, **When** I choose to invite them to play from the Friends & Invites context, **Then** an invite is sent and I receive clear feedback if Player W becomes unavailable before responding.
7. **Given** there are many players listed, **When** I search by display name, **Then** the results narrow to matching players and maintain the prioritization of recent opponents where applicable.
8. **Given** I am not signed in, **When** I try to access the All Players list, **Then** I am informed I must sign in to view and interact with players.
9. **Given** I have enabled presence hiding, **When** other users view the All Players list, **Then** I do not appear in their list.
10. **Given** there are more than 100 available players, **When** I first open the All Players view, **Then** I initially see up to 100 entries and additional players load progressively as I scroll.
11. **Given** two players share the same display name, **When** I view the list, **Then** I can distinguish them by Avatar and short UserID.
12. **Given** I toggle the sort to "Alphabetical", **When** I view the All Players list, **Then** the list is sorted alphabetically by display name and recent-opponent prioritization is not applied.
13. **Given** I am a new user viewing the lobby for the first time, **When** the discoverability prompt is shown, **Then** the default is Visible and I can choose to hide my presence.

### Edge Cases
- The service reports no currently available players → display an empty-state message with guidance (e.g., "No players are currently available. Check back soon.").
- A player changes availability between display and action (e.g., goes in-match) → the action fails gracefully with a clear, non-technical message and no duplicate friendship is created.
- Multiple players share the same display name → the UI differentiates entries using Avatar and short human-friendly UserID.
- Very large player population → initially show up to 100 players and progressively load more as the user scrolls; the experience remains responsive.
- Presence hiding → players who opt to hide their presence do not appear in the All Players list.
- First-run discoverability prompt is dismissed or skipped → default remains Visible until the user changes it.
- International/long names or special characters → names are rendered legibly without truncating critical information.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: The system MUST present an "All Players" view within the Friends & Invites area of the online lobby.
- **FR-002**: The system MUST define "currently available" as players who are online and not in a match (with presence visible).
- **FR-003**: The All Players view MUST prioritize players from the user's last 10 matches above other available players; within that group, order by highest frequency across those matches, with ties broken by most recent match time.
- **FR-004**: The All Players view MUST show, at minimum, each player's Avatar, display name, short human-friendly UserID, and availability/presence state.
- **FR-005**: The system MUST allow manually adding a player as a friend from the All Players view.
- **FR-006**: The system MUST prevent duplicate friend entries and indicate when a player is already a friend.
- **FR-007**: The system MUST disable or remove any auto-friending behavior following a match; friendships are created only by explicit user action.
- **FR-008**: The system MUST allow inviting an available player to play from the Friends & Invites context, with clear success/failure feedback.
- **FR-009**: The system MUST provide search by display name (case-insensitive).
- **FR-010**: The All Players view MUST initially show up to 100 players and progressively load more as the user scrolls.
- **FR-011**: The system MUST provide a user option to hide presence; players who hide presence MUST NOT appear in the All Players list. On first run, the user is prompted to choose; the default is Visible unless the user opts to hide.
- **FR-012**: The system MUST handle mid-action availability changes gracefully (e.g., invite or add friend should fail safely with a clear message if the target becomes unavailable).
- **FR-013**: The system MUST require the user to be signed in to view or interact with the All Players list and its actions.
- **FR-014**: The system MUST provide a sorting toggle between "Recent first" and "Alphabetical" and SHOULD remember the user's last choice at least for the session.
- **FR-015**: The system MUST provide an empty-state when no players are currently available.

### Key Entities *(include if feature involves data)*
- **Player**: A person who can appear in the lobby; identified by a display name and has a friendship relationship and discoverability preference (presence hide option; default Visible with first-run prompt).
- **Availability/Presence**: A player's current availability state for browsing/invites; eligible to appear when online, not in a match, and presence is visible (hidden players excluded).
- **Recent Interaction**: A record of a user's opponents across the last 10 matches, used solely to prioritize display order (not to auto-add friends).
- **Friends List**: The user's curated set of players they've explicitly added; no auto-creation.

---
 
## Review & Acceptance Checklist
*GATE: Automated checks run during main() execution*
 
### Content Quality
- [ ] No implementation details (languages, frameworks, APIs)
- [ ] Focused on user value and business needs
- [ ] Written for non-technical stakeholders
- [ ] All mandatory sections completed
 
### Requirement Completeness
- [ ] No [NEEDS CLARIFICATION] markers remain
- [ ] Requirements are testable and unambiguous  
- [ ] Success criteria are measurable
- [ ] Scope is clearly bounded
- [ ] Dependencies and assumptions identified
 
---
 
## Execution Status
*Updated by main() during processing*
 
- [ ] User description parsed
- [ ] Key concepts extracted
- [ ] Ambiguities marked
- [ ] User scenarios defined
- [ ] Requirements generated
- [ ] Entities identified
- [ ] Review checklist passed
 
---
