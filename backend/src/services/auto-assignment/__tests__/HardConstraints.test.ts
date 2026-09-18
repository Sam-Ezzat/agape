// WHY: Unit tests for hard constraint rules
// Ensures each hard constraint correctly validates assignments

import { Gender, ConferenceRole } from '@prisma/client';
import { AssignmentContext } from '../rules/IAssignmentRule';
import { RoomCapacityRule } from '../rules/hard/RoomCapacityRule';
import { GenderMatchRule } from '../rules/hard/GenderMatchRule';
import { RoomTypeMatchRule } from '../rules/hard/RoomTypeMatchRule';
import { RoomAvailabilityRule } from '../rules/hard/RoomAvailabilityRule';
import { BuildingEnabledRule } from '../rules/hard/BuildingEnabledRule';
import { LeaderReservedCapacityRule } from '../rules/hard/LeaderReservedCapacityRule';

// Helper to create mock context
function createMockContext(overrides?: Partial<AssignmentContext>): AssignmentContext {
  const defaults: AssignmentContext = {
    attendee: {
      id: 'attendee-1',
      fullName: 'Test Attendee',
      gender: Gender.MALE,
      conferenceRole: ConferenceRole.ATTENDEE,
      ticketId: null,
      phone: null,
      email: null,
      age: 25,
      church: 'Test Church',
      area: null,
      governorate: null,
      isServant: false,
      arrivalMethod: null,
      busPickupPoint: null,
      paymentMethod: null,
      paymentStatus: null,
      transactionNumber: null,
      notes: null,
      roomingNotes: null,
      internalNotes: null,
      checkedInAt: null,
      checkedOutAt: null,
      checkedInBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    },
    room: {
      id: 'room-1',
      floorId: 'floor-1',
      roomNumber: '101',
      capacity: 4,
      roomType: 'GENERAL',
      amenities: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      currentOccupancy: 2,
      currentAssignments: [],
      floor: {
        floorNumber: 1,
        building: {
          id: 'building-1',
          name: 'Building A',
          conferenceHouseId: 'house-1'
        }
      }
    } as any
  };
  
  return { ...defaults, ...overrides };
}

describe('RoomCapacityRule', () => {
  let rule: RoomCapacityRule;
  
  beforeEach(() => {
    rule = new RoomCapacityRule();
  });
  
  it('should allow assignment when room has capacity', () => {
    const context = createMockContext();
    const result = rule.validate(context);
    
    expect(result.valid).toBe(true);
  });
  
  it('should reject assignment when room is at full capacity', () => {
    const context = createMockContext({
      room: {
        ...createMockContext().room,
        capacity: 4,
        currentOccupancy: 4
      }
    });
    
    const result = rule.validate(context);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('full capacity');
  });
  
  it('should reject assignment when room is over capacity', () => {
    const context = createMockContext({
      room: {
        ...createMockContext().room,
        capacity: 4,
        currentOccupancy: 5
      }
    });
    
    const result = rule.validate(context);
    
    expect(result.valid).toBe(false);
  });
  
  it('should provide clear explanation', () => {
    const context = createMockContext();
    const result = rule.validate(context);
    const explanation = rule.explain(context, result);
    
    expect(explanation).toContain('2/4');
  });
});

describe('GenderMatchRule', () => {
  let rule: GenderMatchRule;
  
  beforeEach(() => {
    rule = new GenderMatchRule();
  });
  
  it('should allow assignment to empty room regardless of gender', () => {
    const context = createMockContext({
      attendee: { ...createMockContext().attendee, gender: Gender.FEMALE },
      room: {
        ...createMockContext().room,
        currentOccupancy: 0
      }
    });
    
    const result = rule.validate(context);
    
    expect(result.valid).toBe(true);
  });
  
  it('should allow mixed genders in FAMILY rooms', () => {
    const context = createMockContext({
      attendee: { ...createMockContext().attendee, gender: Gender.FEMALE },
      room: {
        ...createMockContext().room,
        roomType: 'FAMILY',
        currentOccupancy: 2
      } as any
    });
    
    const result = rule.validate(context);
    
    expect(result.valid).toBe(true);
  });
  
  it('should reject mixed genders in GENERAL rooms when assignedGender is set', () => {
    const baseContext = createMockContext();
    
    // Create male and female attendees
    const maleAttendee = { id: 'male-attendee-1', gender: Gender.MALE, name: 'John' } as any;
    const femaleAttendee = { ...baseContext.attendee, id: 'female-attendee-1', gender: Gender.FEMALE };
    
    // Create a room with a male occupant
    const roomWithGender: any = {
      ...baseContext.room,
      roomType: 'GENERAL' as const,
      currentOccupancy: 1,
      currentAssignments: [{ attendeeId: 'male-attendee-1', id: 'assignment-1' }]
    };
    
    const context: AssignmentContext = {
      attendee: femaleAttendee,
      room: roomWithGender,
      allAttendees: [maleAttendee, femaleAttendee]
    };
    
    const result = rule.validate(context);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('MALE');
  });
  
  it('should reject OTHER gender in occupied rooms', () => {
    const context = createMockContext({
      attendee: { ...createMockContext().attendee, gender: Gender.OTHER },
      room: {
        ...createMockContext().room,
        currentOccupancy: 2
      }
    });
    
    const result = rule.validate(context);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('OTHER gender');
  });
});

describe('RoomTypeMatchRule', () => {
  let rule: RoomTypeMatchRule;
  
  beforeEach(() => {
    rule = new RoomTypeMatchRule();
  });
  
  it('should allow ATTENDEE in GENERAL rooms', () => {
    const context = createMockContext({
      attendee: { ...createMockContext().attendee, conferenceRole: ConferenceRole.ATTENDEE },
      room: { ...createMockContext().room, roomType: 'GENERAL' } as any
    });
    
    const result = rule.validate(context);
    
    expect(result.valid).toBe(true);
  });
  
  it('should require VIP room for VIP attendees', () => {
    const context = createMockContext({
      attendee: { ...createMockContext().attendee, conferenceRole: ConferenceRole.VIP },
      room: { ...createMockContext().room, roomType: 'GENERAL' } as any
    });
    
    const result = rule.validate(context);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('VIP rooms');
  });
  
  it('should allow VIP in VIP rooms', () => {
    const context = createMockContext({
      attendee: { ...createMockContext().attendee, conferenceRole: ConferenceRole.VIP },
      room: { ...createMockContext().room, roomType: 'VIP' } as any
    });
    
    const result = rule.validate(context);
    
    expect(result.valid).toBe(true);
  });
  
  it('should reject non-family attendees in FAMILY rooms', () => {
    const context = createMockContext({
      attendee: { ...createMockContext().attendee, conferenceRole: ConferenceRole.ATTENDEE },
      room: { ...createMockContext().room, roomType: 'FAMILY' } as any,
      configuration: { requiresFamily: false }
    });
    
    const result = rule.validate(context);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('family groups');
  });
  
  it('should allow family groups in FAMILY rooms', () => {
    const context = createMockContext({
      attendee: { ...createMockContext().attendee, conferenceRole: ConferenceRole.ATTENDEE },
      room: { ...createMockContext().room, roomType: 'FAMILY' } as any,
      configuration: { requiresFamily: true }
    });
    
    const result = rule.validate(context);
    
    expect(result.valid).toBe(true);
  });
});

describe('RoomAvailabilityRule', () => {
  let rule: RoomAvailabilityRule;
  
  beforeEach(() => {
    rule = new RoomAvailabilityRule();
  });
  
  it('should allow assignment to available room', () => {
    const context = createMockContext();
    const result = rule.validate(context);
    
    expect(result.valid).toBe(true);
  });
  
  it('should reject assignment to fully occupied room', () => {
    const context = createMockContext({
      room: {
        ...createMockContext().room,
        capacity: 4,
        currentOccupancy: 4
      }
    });
    
    const result = rule.validate(context);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('fully occupied');
  });
  
  it('should reject assignment to disabled room', () => {
    const context = createMockContext({
      room: {
        ...createMockContext().room,
        isDisabled: true
      } as any
    });
    
    const result = rule.validate(context);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('disabled');
  });
});

describe('BuildingEnabledRule', () => {
  it('should allow all buildings when none are configured', () => {
    const rule = new BuildingEnabledRule([]);
    const context = createMockContext();
    const result = rule.validate(context);
    
    expect(result.valid).toBe(true);
  });
  
  it('should allow assignment to enabled building', () => {
    const rule = new BuildingEnabledRule(['building-1']);
    const context = createMockContext();
    const result = rule.validate(context);
    
    expect(result.valid).toBe(true);
  });
  
  it('should reject assignment to disabled building', () => {
    const rule = new BuildingEnabledRule(['building-2']);
    const context = createMockContext();
    const result = rule.validate(context);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not enabled');
  });
  
  it('should support updating enabled buildings', () => {
    const rule = new BuildingEnabledRule(['building-2']);
    rule.setEnabledBuildings(['building-1']);

    const context = createMockContext();
    const result = rule.validate(context);

    expect(result.valid).toBe(true);
  });
});

describe('LeaderReservedCapacityRule', () => {
  it('should allow assignment when reservation is disabled (0 slots)', () => {
    const rule = new LeaderReservedCapacityRule(0);
    // capacity 4, currentOccupancy 3 -> would fill the room completely
    const context = createMockContext({
      room: { ...createMockContext().room, currentOccupancy: 3 } as any
    });
    const result = rule.validate(context);

    expect(result.valid).toBe(true);
  });

  it('should reject an ordinary attendee when the assignment would leave fewer beds than reserved', () => {
    const rule = new LeaderReservedCapacityRule(1);
    // capacity 4, currentOccupancy 3 -> assigning one more fills the room to 4/4, leaving 0 reserved beds
    const context = createMockContext({
      room: { ...createMockContext().room, currentOccupancy: 3 } as any
    });
    const result = rule.validate(context);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('leader');
  });

  it('should allow an ordinary attendee when enough beds remain reserved after assignment', () => {
    const rule = new LeaderReservedCapacityRule(1);
    // capacity 4, currentOccupancy 2 -> assigning one more makes 3/4, still 1 free bed
    const context = createMockContext({
      room: { ...createMockContext().room, currentOccupancy: 2 } as any
    });
    const result = rule.validate(context);

    expect(result.valid).toBe(true);
  });

  it('should allow a LEADER-role attendee to use the reserved slot themselves', () => {
    const rule = new LeaderReservedCapacityRule(1);
    const context = createMockContext({
      attendee: { ...createMockContext().attendee, conferenceRole: ConferenceRole.LEADER } as any,
      room: { ...createMockContext().room, currentOccupancy: 3 } as any
    });
    const result = rule.validate(context);

    expect(result.valid).toBe(true);
  });

  it('should allow a servant-flagged attendee to use the reserved slot themselves', () => {
    const rule = new LeaderReservedCapacityRule(1);
    const context = createMockContext({
      attendee: { ...createMockContext().attendee, isServant: true } as any,
      room: { ...createMockContext().room, currentOccupancy: 3 } as any
    });
    const result = rule.validate(context);

    expect(result.valid).toBe(true);
  });

  it('should not apply the reservation to FAMILY rooms', () => {
    const rule = new LeaderReservedCapacityRule(1);
    const context = createMockContext({
      room: { ...createMockContext().room, currentOccupancy: 3, roomType: 'FAMILY' } as any
    });
    const result = rule.validate(context);

    expect(result.valid).toBe(true);
  });
});
