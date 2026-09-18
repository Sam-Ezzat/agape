# Auto-Assignment System Improvements

## Overview
Enhanced the auto-assignment system with better roommate handling, detailed reasoning display, and improved building-level gender segregation.

## Key Improvements

### 1. **Roommate Group Handling** ✅
**Problem:** System was splitting roommates into different rooms even when single rooms with matching capacity were available.

**Solution:**
- Added `tryAssignRoommatesTogether()` method that prioritizes finding a single room for all roommates
- For ROOMMATE groups (2+ people):
  1. First tries to find rooms with exact capacity match
  2. Validates all members pass hard constraints for the room
  3. Assigns all roommates together if suitable room found
  4. Only falls back to individual assignment if no suitable room exists
  5. Tracks how many roommates ended up in the same room

**Files Modified:**
- `backend/src/services/auto-assignment/AutoAssignmentService.ts`
  - Added `tryAssignRoommatesTogether()` method (lines 730-869)
  - Modified `assignGroup()` to check for ROOMMATE groups first

### 2. **Assignment Reasoning & Explanation** ✅
**Problem:** Preview showed assignments without explaining WHY decisions were made.

**Solution:**
- Added `reason` field to `AssignmentResult` showing human-readable explanation
- Added `scoreBreakdown` showing contribution of each rule (0-1 scale)
- Added `groupInfo` tracking group membership and roommate status
- Added `buildAssignmentReason()` method that constructs explanations including:
  - Group type and size
  - Room type (VIP, Family, General)
  - Top scoring factors (rules with >15% contribution)
  - Room occupancy after assignment
  - Overall quality score percentage

**Example Reasoning:**
```
"Part of roommate group (3 people). Assigned with 2 roommate(s) to room 101 (capacity 3). 
Roommates kept together as requested. Best match: Same church (+25%), Similar age (+20%). 
Room occupancy: 3/3. Overall quality: 85%."
```

**Files Modified:**
- `backend/src/types/auto-assignment.ts` - Updated `AssignmentResult` interface
- `backend/src/services/auto-assignment/AutoAssignmentService.ts`
  - Added `buildAssignmentReason()` method (lines 871-927)
  - Added `humanizeRuleName()` helper (lines 929-942)
  - Added `scoreRoomsDetailed()` method returning score breakdowns (lines 1006-1055)
- `frontend/src/types/api.ts` - Updated `AssignmentPreview` interface
- `frontend/src/pages/AutoAssignmentPage.tsx` - Added "Reasoning" column to preview table

### 3. **Building-Level Gender Segregation** ✅
**Problem:** Different genders were being assigned to the same building.

**Solution:**
- Added `buildingGenderMap: Map<string, Gender>` to track which gender is assigned to each building
- In `findCandidateRooms()`:
  - Checks building gender BEFORE evaluating other constraints
  - Skips rooms in buildings already assigned to different gender
  - FAMILY rooms exempt from building gender restrictions
  - Empty buildings can accept any gender (first occupant sets the building gender)
- Building gender map:
  - Initialized in constructor
  - Cleared at start of each execution
  - Updated when non-FAMILY room gets its first occupant

**Files Modified:**
- `backend/src/services/auto-assignment/AutoAssignmentService.ts`
  - Added `buildingGenderMap` property (line 89)
  - Initialize in constructor (line 106)
  - Clear on execution start (line 126)
  - Check in `findCandidateRooms()` (lines 949-967)
  - Update in `assignGroup()` when room assigned (lines 694-698)

### 4. **Improved Error Messages** ✅
- Changed "No available rooms match hard constraints" to include specific reasons:
  - "No available rooms match hard constraints (capacity, gender, building restrictions)"
- Better warning messages for split roommate groups:
  - "No single room found with capacity for N roommates. Will assign to separate rooms."

### 5. **Enhanced Preview Display** ✅
- Added "Reasoning" column showing why each assignment was made
- Truncated long reasoning with hover tooltip for full text
- Score display remains color-coded:
  - Green (≥80%): Excellent match
  - Yellow (60-79%): Good match
  - Orange (<60%): Acceptable but suboptimal

### 6. **Debug Logging** ✅
Added comprehensive console logging for troubleshooting:
- Preview request/response logging
- WebSocket connection status
- executionResult state changes
- Display condition validation

## Testing

✅ All 167 tests passing
✅ TypeScript compilation clean (backend & frontend)
✅ No breaking changes to existing API

## Technical Details

### Score Calculation
- Scores now consistently use 0-1 decimal range (not 0-100)
- RuleEngine divides by 100 to normalize percentage scores to decimals
- Frontend multiplies by 100 for display purposes

### Group Types
- `ROOMMATE`: Explicit roommate requests - system tries to keep together
- `FAMILY`: Family members - preferred same building
- `CHURCH`: Same church group - weighted by SameChurchRule
- `GOVERNORATE`: Same region - weighted by SameGovernorateRule
- `INDIVIDUAL`: No group affiliation

### Constraint Hierarchy
1. **Building Gender** (checked first in `findCandidateRooms`)
2. **Hard Constraints** (capacity, room gender, availability, building enabled)
3. **Soft Constraints** (scored 0-1):
   - Same Church: 0.25
   - Same Governorate: 0.15
   - Similar Age: 0.20
   - Minimize Empty Beds: 0.15
   - Prefer Same Floor: 0.15
   - Leader Proximity: 0.10

## Next Steps (Optional Future Enhancements)

1. **Advanced Reasoning Display**
   - Expandable rows showing full score breakdown
   - Visual indicators for constraint violations
   - Comparison view showing alternative room options

2. **Roommate Conflict Detection**
   - Detect conflicting roommate requests
   - Warn about circular dependencies
   - Suggest resolution strategies

3. **Building Utilization Optimization**
   - Try to fill entire buildings before moving to next building
   - Minimize cross-building fragmentation
   - Better floor-level grouping for large church groups

4. **AI-Enhanced Reasoning**
   - Use GPT to generate natural language explanations
   - Explain trade-offs between competing constraints
   - Suggest manual interventions for low-scoring assignments
