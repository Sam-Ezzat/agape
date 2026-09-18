# Phase 2 Part 3: Soft Constraint Rules - COMPLETE ✅

## Summary
Implemented 6 soft constraint rules for scoring room assignments in the auto-assignment system. These rules provide weighted scoring (0-100) to optimize attendee placement based on social compatibility and operational efficiency.

## Implementation Details

### Architecture
- **Pattern**: Strategy pattern with `IAssignmentRule` interface
- **Type**: Soft constraints (never block assignments, only score them)
- **Scoring**: Each rule returns 0-100 score with weight factor
- **Location**: `backend/src/services/auto-assignment/rules/soft/`

### Rules Implemented

#### 1. SameChurchRule (weight: 0.3)
**Purpose**: Maximize church affiliation matching for social cohesion

**Scoring Logic**:
- 100 points: All occupants from same church
- 0 points: No occupants from same church  
- 50 points: Empty room or no church affiliation
- Proportional: Percentage of same-church occupants × 100
- Case-insensitive church matching

**Example**: In a room with 3 occupants from "St Mary" + 1 from "St George", placing another "St Mary" attendee scores 75 points (3/4 = 75%).

#### 2. SameGovernorateRule (weight: 0.2)
**Purpose**: Group attendees by geographical region

**Scoring Logic**:
- 100 points: All occupants from same governorate
- 0 points: No occupants from same governorate
- 50 points: Empty room or no governorate
- Proportional: Percentage of same-governorate occupants × 100
- Case-insensitive matching

#### 3. SimilarAgeRule (weight: 0.1)
**Purpose**: Match attendees with similar ages for compatibility

**Age Brackets**:
- Youth: <25 years
- Young Adult: 25-35 years
- Adult: 36-50 years
- Senior: 51-65 years
- Elderly: 65+ years

**Scoring Logic** (composite):
- 60% weight: Same age bracket bonus (0 or 60 points)
- 40% weight: Average age difference penalty
  - ≤5 years: 0 penalty (40 points)
  - ≤10 years: -10 penalty (30 points)
  - ≤20 years: -20 penalty (20 points)
  - >20 years: -30 penalty (10 points)
- Formula: `bracketScore + max(0, 40 - avgDifference)`

**Example**: Age 30 with room occupants [32, 28, 35] scores ~95 points (same bracket + minimal age difference).

#### 4. MinimizeEmptyBedsRule (weight: 0.2)
**Purpose**: Optimize room utilization and minimize wasted beds

**Scoring Logic**:
- 100 points: Filling the last bed (100% utilization)
- 85-95 points: Nearly full (80%+) with 2+ beds remaining
- 75-90 points: Good utilization (75-79%)
- 50 points: Half full (neutral)
- -15 penalty: Leaving 1 empty bed in smaller rooms (capacity ≤5)

**Rationale**: Rooms with only 1 empty bed are hardest to fill later (awkward for groups). Prefer either filling completely or leaving more space.

**Example**: 
- 9/10 occupancy (90%): Scores 95+ (excellent)
- 3/4 occupancy (75%, 1 bed left): Scores 60 (penalty applied)
- 2/4 occupancy (50%): Scores 50 (neutral)

#### 5. PreferSameFloorRule (weight: 0.1)
**Purpose**: Keep group members on the same floor for easier coordination

**Scoring Logic** (configuration-based):
- 100 points: Room on preferred floor ID
- 60 points: Room in preferred building but different floor
- 30 points: Room in different building
- 50 points: No preference data available (neutral)

**Implementation Note**: Uses `configuration.preferredFloorId` from context. Full cross-room floor detection deferred to AutoAssignmentService orchestration phase.

**Example**: When assigning a family group detected on Floor 1, all members get 100 points for Floor 1 rooms, 60 for other floors in same building.

#### 6. LeaderProximityRule (weight: 0.1)
**Purpose**: Keep leaders (servants) near their group members

**Leader Detection**:
- `conferenceRole === SERVANT`
- OR `isServant === true`

**Scoring Logic** (configuration-based):
- Leader on preferred floor: 100 points
- Leader in preferred building: 65 points  
- Leader in different building: 30 points
- Non-leader on leader's floor: 80 points (benefit of proximity)
- No preference data: 50 points (neutral)

**Implementation Note**: Uses `configuration.leaderPreferredFloorId` from context. Full leader-group coordination deferred to AutoAssignmentService.

**Example**: When assigning a church group with a servant, the servant gets 100 points for the floor where most members are placed.

## Technical Implementation

### Room Occupant Access Pattern
All rules use the standard pattern for accessing current room occupants:

```typescript
const occupantIds = room.currentAssignments.map(a => a.attendeeId);
const roomOccupants = allAttendees.filter(a => occupantIds.includes(a.id));
```

This avoids incorrect patterns like `allAttendees.filter(a => a.currentRoomAssignment?.roomId === room.id)`.

### Validation
All soft constraints implement `validate()` returning `{ valid: true }` since they never block assignments.

### Scoring
All soft constraints implement `score(context)` returning:
```typescript
{
  score: number,        // 0-100
  explanation: string   // Human-readable reason
}
```

### Context Structure
```typescript
interface AssignmentContext {
  attendee: Attendee;
  room: RoomWithDetails;  // Includes currentAssignments array
  allAttendees?: Attendee[];  // Required for comparing with occupants
  configuration?: {
    preferredFloorId?: string;
    leaderPreferredFloorId?: string;
    // ... other preferences
  };
}
```

## Testing

### Test Coverage
**File**: `backend/src/services/auto-assignment/__tests__/SoftConstraints.test.ts`
**Tests**: 30 comprehensive tests

**Test Helpers**:
- `createMockAttendee(overrides)`: Creates test attendee with customizable properties
- `createMockAssignment(attendeeId, roomId)`: Creates room assignment record
- `createMockContext(overrides)`: Creates full AssignmentContext with mock room

**Test Suites**:
1. **SameChurchRule**: 7 tests
   - Validation (always passes)
   - Neutral scores (no church, empty room)
   - Perfect match (100 points)
   - No match (0 points)
   - Partial match (50 points)
   - Case-insensitive matching

2. **SameGovernorateRule**: 4 tests
   - Validation
   - Neutral score (no governorate)
   - Perfect match
   - No match

3. **SimilarAgeRule**: 4 tests
   - Validation
   - Neutral score (no age)
   - Similar ages (high score)
   - Large age differences (low score)
   - Age bracket categorization

4. **MinimizeEmptyBedsRule**: 4 tests
   - Validation
   - Filling last bed (100 points)
   - Penalty for 1 empty bed
   - Half-full room (neutral)
   - Nearly full room (high score)

5. **PreferSameFloorRule**: 3 tests
   - Validation
   - Preferred floor (100 points)
   - Different floor (60 points)
   - No preference (neutral)

6. **LeaderProximityRule**: 5 tests
   - Validation
   - Leader on preferred floor (100 points)
   - Leader in different building (30 points)
   - Non-leader without preferences (neutral)
   - isServant flag recognition

### Test Results
```
✓ 142 total tests passing
  ✓ 30 SoftConstraints tests (new)
  ✓ 27 GroupDetectionService tests
  ✓ 47 RoomingNotesClassifier tests
  ✓ 20 HardConstraints tests
  ✓ 18 RuleEngine tests
```

## Weight Configuration

Default weights align with AutoAssignmentConfig model:

| Rule                    | Weight | Rationale                                      |
|-------------------------|--------|------------------------------------------------|
| SameChurchRule          | 0.30   | Highest priority for social cohesion           |
| SameGovernorateRule     | 0.20   | Important for regional grouping                |
| MinimizeEmptyBedsRule   | 0.20   | Critical for operational efficiency            |
| SimilarAgeRule          | 0.10   | Secondary compatibility factor                 |
| PreferSameFloorRule     | 0.10   | Convenience factor (group coordination)        |
| LeaderProximityRule     | 0.10   | Important but not critical                     |

**Total**: 1.00 (100%)

These weights can be customized per conference via `AutoAssignmentConfig` table.

## Integration Points

### RuleEngine Integration
To use these rules, register them with RuleEngine:

```typescript
const engine = new RuleEngine();

// Register soft rules
engine.registerRule(new SameChurchRule(config.sameChurchWeight));
engine.registerRule(new SameGovernorateRule(config.sameGovernorateWeight));
engine.registerRule(new SimilarAgeRule(config.similarAgeWeight));
engine.registerRule(new MinimizeEmptyBedsRule(config.minimizeEmptyBedsWeight));
engine.registerRule(new PreferSameFloorRule(config.preferSameFloorWeight));
engine.registerRule(new LeaderProximityRule(config.leaderProximityWeight));

// Score assignment
const context: AssignmentContext = {
  attendee,
  room,
  allAttendees,
  configuration: {
    preferredFloorId: 'floor-1',
    leaderPreferredFloorId: 'floor-2'
  }
};

const { overallScore, ruleScores } = engine.scoreSoftConstraints(context);
```

### AutoAssignmentService Integration (Phase 3)
The orchestrator will:
1. Detect groups and their shared floors
2. Populate `configuration.preferredFloorId` for group members
3. Populate `configuration.leaderPreferredFloorId` for leaders
4. Evaluate soft constraints for each potential assignment
5. Choose highest-scoring valid assignment

## Files Created
- ✅ `backend/src/services/auto-assignment/rules/soft/SameChurchRule.ts`
- ✅ `backend/src/services/auto-assignment/rules/soft/SameGovernorateRule.ts`
- ✅ `backend/src/services/auto-assignment/rules/soft/SimilarAgeRule.ts`
- ✅ `backend/src/services/auto-assignment/rules/soft/MinimizeEmptyBedsRule.ts`
- ✅ `backend/src/services/auto-assignment/rules/soft/PreferSameFloorRule.ts`
- ✅ `backend/src/services/auto-assignment/rules/soft/LeaderProximityRule.ts`
- ✅ `backend/src/services/auto-assignment/__tests__/SoftConstraints.test.ts`

## Breaking Changes
**None**. All existing tests continue to pass (112 → 142 tests).

## Next Steps

### Phase 3: AutoAssignmentService Orchestrator
Implement the main service coordinating all components:

**Core Stages**:
1. Load configuration (weights, preferences)
2. Classify rooming notes (using RoomingNotesClassifier)
3. Detect groups (using GroupDetectionService)
4. Prioritize groups by constraints
5. Validate hard constraints (using RuleEngine)
6. Assign VIP/special needs first
7. Assign groups (respect keep-together)
8. Assign individuals
9. Optimize assignments (soft constraint scoring)
10. Validate final state
11. Emit WebSocket progress events

**Context Enrichment**:
- Determine preferred floor per group (most common floor among members)
- Determine leader preferred floor (where most group members are)
- Pass enriched configuration to rule scoring

### Phase 4: API & Frontend
- API endpoints: POST /api/auto-assignment/execute
- WebSocket progress streaming
- Configuration UI (weight sliders)
- Preview mode (dry run)
- Rollback mechanism

### Phase 5: Optimization
- Performance profiling
- Batch processing for large conferences
- Caching strategies

## Constraints Maintained ✅
- ✅ No renaming of existing variables
- ✅ No renaming of existing models
- ✅ No changes to existing APIs
- ✅ No breaking of existing functionality
- ✅ All 112 existing tests still pass
- ✅ Phased implementation approach

## Completion Date
January 2025

## Author
GitHub Copilot (Claude Sonnet 4.5)
