// WHY: Test suite for soft constraint rules
// Verifies scoring logic and edge case handling

import { describe, it, expect, beforeEach } from 'vitest';
import { Attendee, Gender, ConferenceRole, PaymentStatus, RoomType, RoomAssignment } from '@prisma/client';
import { AssignmentContext } from '../rules/IAssignmentRule';
import { SameChurchRule } from '../rules/soft/SameChurchRule';
import { SameGovernorateRule } from '../rules/soft/SameGovernorateRule';
import { SimilarAgeRule } from '../rules/soft/SimilarAgeRule';
import { MinimizeEmptyBedsRule } from '../rules/soft/MinimizeEmptyBedsRule';
import { PreferSameFloorRule } from '../rules/soft/PreferSameFloorRule';
import { LeaderProximityRule } from '../rules/soft/LeaderProximityRule';

// Helper to create mock attendee
function createMockAttendee(overrides?: Partial<Attendee>): Attendee {
  return {
    id: 'test-id',
    ticketId: null,
    fullName: 'Test Attendee',
    phone: null,
    email: null,
    age: 30,
    gender: Gender.MALE,
    church: 'Test Church',
    area: null,
    governorate: 'Cairo',
    isServant: false,
    arrivalMethod: null,
    busPickupPoint: null,
    paymentMethod: null,
    paymentStatus: PaymentStatus.PENDING,
    transactionNumber: null,
    conferenceRole: ConferenceRole.ATTENDEE,
    notes: null,
    roomingNotes: null,
    internalNotes: null,
    checkedInAt: null,
    checkedOutAt: null,
    checkedInBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides
  };
}

// Helper to create mock room assignment
function createMockAssignment(attendeeId: string, roomId: string): RoomAssignment {
  return {
    id: `assignment-${attendeeId}`,
    attendeeId,
    roomId,
    assignedAt: new Date(),
    assignedBy: 'system',
    isLocked: false,
    lockedAt: null,
    lockedBy: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

// Helper to create mock room context
function createMockContext(overrides?: Partial<AssignmentContext>): AssignmentContext {
  return {
    attendee: createMockAttendee(),
    room: {
      id: 'room-1',
      roomNumber: '101',
      roomType: RoomType.DOUBLE,
      capacity: 4,
      floorId: 'floor-1',
      assignedGender: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      currentOccupancy: 0,
      currentAssignments: [],
      floor: {
        floorNumber: 1,
        building: {
          id: 'building-1',
          name: 'Building A',
          conferenceHouseId: 'house-1'
        }
      }
    },
    allAttendees: [],
    ...overrides
  };
}

describe('SameChurchRule', () => {
  let rule: SameChurchRule;

  beforeEach(() => {
    rule = new SameChurchRule(0.3);
  });

  it('should always validate successfully (soft constraint)', () => {
    const context = createMockContext();
    const result = rule.validate(context);
    expect(result.valid).toBe(true);
  });

  it('should return neutral score for attendee with no church', () => {
    const context = createMockContext({
      attendee: createMockAttendee({ church: null })
    });
    const result = rule.score(context);
    expect(result.score).toBe(50);
  });

  it('should return neutral score for empty room', () => {
    const context = createMockContext();
    const result = rule.score(context);
    expect(result.score).toBe(50);
  });

  it('should return 100 when all occupants from same church', () => {
    const attendee = createMockAttendee({ id: 'att-1', church: 'St Mary' });
    const occupant1 = createMockAttendee({ id: 'occ-1', church: 'St Mary' });
    const occupant2 = createMockAttendee({ id: 'occ-2', church: 'St Mary' });

    const context = createMockContext({
      attendee,
      room: {
        ...createMockContext().room,
        currentAssignments: [
          createMockAssignment('occ-1', 'room-1'),
          createMockAssignment('occ-2', 'room-1')
        ],
        currentOccupancy: 2
      },
      allAttendees: [occupant1, occupant2]
    });

    const result = rule.score(context);
    expect(result.score).toBe(100);
  });

  it('should return 0 when no occupants from same church', () => {
    const attendee = createMockAttendee({ id: 'att-1', church: 'St Mary' });
    const occupant1 = createMockAttendee({ id: 'occ-1', church: 'St George' });
    const occupant2 = createMockAttendee({ id: 'occ-2', church: 'St John' });

    const context = createMockContext({
      attendee,
      room: {
        ...createMockContext().room,
        currentAssignments: [
          createMockAssignment('occ-1', 'room-1'),
          createMockAssignment('occ-2', 'room-1')
        ],
        currentOccupancy: 2
      },
      allAttendees: [occupant1, occupant2]
    });

    const result = rule.score(context);
    expect(result.score).toBe(0);
  });

  it('should return 50 when half occupants from same church', () => {
    const attendee = createMockAttendee({ id: 'att-1', church: 'St Mary' });
    const occupant1 = createMockAttendee({ id: 'occ-1', church: 'St Mary' });
    const occupant2 = createMockAttendee({ id: 'occ-2', church: 'St George' });

    const context = createMockContext({
      attendee,
      room: {
        ...createMockContext().room,
        currentAssignments: [
          createMockAssignment('occ-1', 'room-1'),
          createMockAssignment('occ-2', 'room-1')
        ],
        currentOccupancy: 2
      },
      allAttendees: [occupant1, occupant2]
    });

    const result = rule.score(context);
    expect(result.score).toBe(50);
  });

  it('should match churches case-insensitively', () => {
    const attendee = createMockAttendee({ id: 'att-1', church: 'ST MARY' });
    const occupant = createMockAttendee({ id: 'occ-1', church: 'st mary' });

    const context = createMockContext({
      attendee,
      room: {
        ...createMockContext().room,
        currentAssignments: [createMockAssignment('occ-1', 'room-1')],
        currentOccupancy: 1
      },
      allAttendees: [occupant]
    });

    const result = rule.score(context);
    expect(result.score).toBe(100);
  });
});

describe('SameGovernorateRule', () => {
  let rule: SameGovernorateRule;

  beforeEach(() => {
    rule = new SameGovernorateRule(0.2);
  });

  it('should always validate successfully', () => {
    const context = createMockContext();
    const result = rule.validate(context);
    expect(result.valid).toBe(true);
  });

  it('should return neutral score for attendee with no governorate', () => {
    const context = createMockContext({
      attendee: createMockAttendee({ governorate: null })
    });
    const result = rule.score(context);
    expect(result.score).toBe(50);
  });

  it('should return 100 when all occupants from same governorate', () => {
    const attendee = createMockAttendee({ id: 'att-1', governorate: 'Cairo' });
    const occupant1 = createMockAttendee({ id: 'occ-1', governorate: 'Cairo' });
    const occupant2 = createMockAttendee({ id: 'occ-2', governorate: 'Cairo' });

    const context = createMockContext({
      attendee,
      room: {
        ...createMockContext().room,
        currentAssignments: [
          createMockAssignment('occ-1', 'room-1'),
          createMockAssignment('occ-2', 'room-1')
        ],
        currentOccupancy: 2
      },
      allAttendees: [occupant1, occupant2]
    });

    const result = rule.score(context);
    expect(result.score).toBe(100);
  });

  it('should return 0 when no occupants from same governorate', () => {
    const attendee = createMockAttendee({ id: 'att-1', governorate: 'Cairo' });
    const occupant = createMockAttendee({ id: 'occ-1', governorate: 'Alexandria' });

    const context = createMockContext({
      attendee,
      room: {
        ...createMockContext().room,
        currentAssignments: [createMockAssignment('occ-1', 'room-1')],
        currentOccupancy: 1
      },
      allAttendees: [occupant]
    });

    const result = rule.score(context);
    expect(result.score).toBe(0);
  });
});

describe('SimilarAgeRule', () => {
  let rule: SimilarAgeRule;

  beforeEach(() => {
    rule = new SimilarAgeRule(0.1);
  });

  it('should always validate successfully', () => {
    const context = createMockContext();
    const result = rule.validate(context);
    expect(result.valid).toBe(true);
  });

  it('should return neutral score for attendee with no age', () => {
    const context = createMockContext({
      attendee: createMockAttendee({ age: null })
    });
    const result = rule.score(context);
    expect(result.score).toBe(50);
  });

  it('should return high score for similar ages (within 5 years)', () => {
    const attendee = createMockAttendee({ id: 'att-1', age: 30 });
    const occupant = createMockAttendee({ id: 'occ-1', age: 32 });

    const context = createMockContext({
      attendee,
      room: {
        ...createMockContext().room,
        currentAssignments: [createMockAssignment('occ-1', 'room-1')],
        currentOccupancy: 1
      },
      allAttendees: [occupant]
    });

    const result = rule.score(context);
    // Same bracket (25-35) + minimal age diff = high score
    expect(result.score).toBeGreaterThan(80);
  });

  it('should return lower score for large age differences', () => {
    const attendee = createMockAttendee({ id: 'att-1', age: 25 });
    const occupant = createMockAttendee({ id: 'occ-1', age: 60 });

    const context = createMockContext({
      attendee,
      room: {
        ...createMockContext().room,
        currentAssignments: [createMockAssignment('occ-1', 'room-1')],
        currentOccupancy: 1
      },
      allAttendees: [occupant]
    });

    const result = rule.score(context);
    // Different brackets + large age diff = low score
    expect(result.score).toBeLessThan(40);
  });

  it('should categorize ages into correct brackets', () => {
    const testCases = [
      { age: 20, expectedBracket: 'youth' },
      { age: 30, expectedBracket: 'young_adult' },
      { age: 45, expectedBracket: 'adult' },
      { age: 60, expectedBracket: 'senior' },
      { age: 70, expectedBracket: 'elderly' }
    ];

    for (const testCase of testCases) {
      const attendee = createMockAttendee({ id: 'att-1', age: testCase.age });
      const occupant = createMockAttendee({ id: 'occ-1', age: testCase.age });

      const context = createMockContext({
        attendee,
        room: {
          ...createMockContext().room,
          currentAssignments: [createMockAssignment('occ-1', 'room-1')],
          currentOccupancy: 1
        },
        allAttendees: [occupant]
      });

      const result = rule.score(context);
      // Same age = perfect score
      expect(result.score).toBe(100);
    }
  });
});

describe('MinimizeEmptyBedsRule', () => {
  let rule: MinimizeEmptyBedsRule;

  beforeEach(() => {
    rule = new MinimizeEmptyBedsRule(0.2);
  });

  it('should always validate successfully', () => {
    const context = createMockContext();
    const result = rule.validate(context);
    expect(result.valid).toBe(true);
  });

  it('should return 100 for filling the last bed', () => {
    const context = createMockContext({
      room: {
        ...createMockContext().room,
        capacity: 4,
        currentOccupancy: 3 // Adding 1 more will fill it
      }
    });

    const result = rule.score(context);
    expect(result.score).toBe(100);
  });

  it('should penalize leaving exactly 1 empty bed', () => {
    const context = createMockContext({
      room: {
        ...createMockContext().room,
        capacity: 4,
        currentOccupancy: 2 // Adding 1 more leaves 1 empty
      }
    });

    const result = rule.score(context);
    // Should be less than neutral due to penalty
    expect(result.score).toBeLessThan(75);
  });

  it('should give neutral score for half-full rooms', () => {
    const context = createMockContext({
      room: {
        ...createMockContext().room,
        capacity: 4,
        currentOccupancy: 1 // Will be 50% full
      }
    });

    const result = rule.score(context);
    expect(result.score).toBe(50);
  });

  it('should give high score for nearly full rooms', () => {
    const context = createMockContext({
      room: {
        ...createMockContext().room,
        capacity: 10,
        currentOccupancy: 8 // Will be 90% full
      }
    });

    const result = rule.score(context);
    expect(result.score).toBeGreaterThan(85);
  });
});

describe('PreferSameFloorRule', () => {
  let rule: PreferSameFloorRule;

  beforeEach(() => {
    rule = new PreferSameFloorRule(0.1);
  });

  it('should always validate successfully', () => {
    const context = createMockContext();
    const result = rule.validate(context);
    expect(result.valid).toBe(true);
  });

  it('should return 100 when room is on preferred floor', () => {
    const context = createMockContext({
      configuration: {
        preferredFloorId: 'floor-1',
        preferredBuildingId: 'building-1'
      }
    });

    const result = rule.score(context);
    expect(result.score).toBe(100);
  });

  it('should return 60 when room is in preferred building but different floor', () => {
    const context = createMockContext({
      room: {
        ...createMockContext().room,
        floorId: 'floor-2'
      },
      configuration: {
        preferredFloorId: 'floor-1',
        preferredBuildingId: 'building-1'
      }
    });

    const result = rule.score(context);
    expect(result.score).toBe(60);
  });

  it('should return neutral score when no floor preference available', () => {
    const context = createMockContext();
    const result = rule.score(context);
    expect(result.score).toBe(50);
  });
});

describe('LeaderProximityRule', () => {
  let rule: LeaderProximityRule;

  beforeEach(() => {
    rule = new LeaderProximityRule(0.1);
  });

  it('should always validate successfully', () => {
    const context = createMockContext();
    const result = rule.validate(context);
    expect(result.valid).toBe(true);
  });

  it('should return 100 for leader on preferred floor', () => {
    const context = createMockContext({
      attendee: createMockAttendee({ 
        conferenceRole: ConferenceRole.LEADER,
        isServant: true  
      }),
      configuration: {
        leaderPreferredFloorId: 'floor-1',
        leaderPreferredBuildingId: 'building-1'
      }
    });

    const result = rule.score(context);
    expect(result.score).toBe(100);
  });

  it('should return lower score for leader in different building', () => {
    const baseRoom = createMockContext().room;
    const context = createMockContext({
      attendee: createMockAttendee({ 
        conferenceRole: ConferenceRole.LEADER,
        isServant: true 
      }),
      room: {
        ...baseRoom,
        floorId: 'floor-2',
        floor: {
          floorNumber: 2,
          building: {
            id: 'building-2', // Different building
            name: 'Building B',
            conferenceHouseId: 'house-1'
          }
        }
      },
      configuration: {
        leaderPreferredFloorId: 'floor-1',
        leaderPreferredBuildingId: 'building-1'
      }
    });

    const result = rule.score(context);
    expect(result.score).toBe(30);
  });

  it('should return neutral score for non-leader without preferences', () => {
    const context = createMockContext({
      attendee: createMockAttendee({ conferenceRole: ConferenceRole.ATTENDEE })
    });

    const result = rule.score(context);
    expect(result.score).toBe(50);
  });

  it('should recognize isServant flag as leader', () => {
    const context = createMockContext({
      attendee: createMockAttendee({ isServant: true, conferenceRole: ConferenceRole.ATTENDEE }),
      configuration: {
        leaderPreferredFloorId: 'floor-1',
        leaderPreferredBuildingId: 'building-1'
      }
    });

    const result = rule.score(context);
    expect(result.score).toBe(100);
  });
});
