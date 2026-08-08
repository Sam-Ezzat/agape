// WHY: Regression coverage for the "friend group" accuracy bug — explicit
// mutual rooming requests (e.g. "A wants B,C,D; B wants A,C; C wants A,D")
// were being computed correctly as one connected component by
// HierarchicalGroupingService, then silently re-fragmented by
// AutoAssignmentService's age/medical sub-grouping before ever reaching room
// placement. No test previously exercised this live code path — the existing
// GroupDetectionService.test.ts covers a different, unused legacy class.

import { describe, it, expect, beforeEach } from 'vitest';
import { HierarchicalGroupingService } from '../HierarchicalGroupingService';
import { AutoAssignmentService } from '../AutoAssignmentService';
import { Attendee, Gender, ConferenceRole, PaymentStatus, RoomType } from '@prisma/client';
import { ClassifiedNotes, RunAutoAssignmentDTO } from '@/types/auto-assignment';

function createMockAttendee(overrides?: Partial<Attendee>): Attendee {
  return {
    id: 'test-id',
    organizationId: 'org-1',
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
    mealType: null,
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
  } as Attendee;
}

function emptyClassification(overrides?: Partial<ClassifiedNotes>): ClassifiedNotes {
  return {
    roommateRequests: [],
    healthIssues: [],
    accessibility: false,
    wheelchair: false,
    elderly: false,
    nearBathroom: false,
    nearElevator: false,
    family: false,
    noPreference: false,
    other: [],
    raw: '',
    ...overrides
  };
}

describe('HierarchicalGroupingService — mutual roommate request graph', () => {
  let service: HierarchicalGroupingService;

  beforeEach(() => {
    service = new HierarchicalGroupingService();
  });

  it('unifies an overlapping multi-person mutual request into one connected-component group', () => {
    // A wants B,C,D; B wants A,C; C wants A,D — not everyone lists everyone,
    // but the request graph is fully connected and should collapse to one group.
    const a = createMockAttendee({ id: 'a', fullName: 'Alice', gender: Gender.FEMALE });
    const b = createMockAttendee({ id: 'b', fullName: 'Bob', gender: Gender.FEMALE });
    const c = createMockAttendee({ id: 'c', fullName: 'Charlie', gender: Gender.FEMALE });
    const d = createMockAttendee({ id: 'd', fullName: 'David', gender: Gender.FEMALE });
    const attendees = [a, b, c, d];

    const classifications = new Map<string, ClassifiedNotes>([
      ['a', emptyClassification({ roommateRequests: ['Bob', 'Charlie', 'David'] })],
      ['b', emptyClassification({ roommateRequests: ['Alice', 'Charlie'] })],
      ['c', emptyClassification({ roommateRequests: ['Alice', 'David'] })],
    ]);

    const result = service.createHierarchicalGroups(attendees, classifications);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].type).toBe('rooming_notes');
    expect(result.groups[0].attendeeIds.size).toBe(4);
    expect(Array.from(result.groups[0].attendeeIds).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(result.ungroupedAttendeeIds.size).toBe(0);
  });

  it('resolves an exact name match instead of guessing on ambiguous common names', () => {
    // Two attendees share the first name "Mohamed" — a substring-match
    // heuristic could silently link the requester to the wrong one.
    const requester = createMockAttendee({ id: 'r', fullName: 'Sara', gender: Gender.FEMALE });
    const target = createMockAttendee({ id: 't', fullName: 'Mohamed Ali', gender: Gender.FEMALE });
    const decoy = createMockAttendee({ id: 'x', fullName: 'Mohamed Hassan', gender: Gender.FEMALE });
    const attendees = [requester, target, decoy];

    const classifications = new Map<string, ClassifiedNotes>([
      ['r', emptyClassification({ roommateRequests: ['Mohamed Ali'] })],
    ]);

    const result = service.createHierarchicalGroups(attendees, classifications);

    const roomingGroup = result.groups.find(g => g.type === 'rooming_notes');
    expect(roomingGroup).toBeDefined();
    expect(Array.from(roomingGroup!.attendeeIds).sort()).toEqual(['r', 't']);
    // The decoy with the ambiguous shared first name must NOT be pulled in
    expect(roomingGroup!.attendeeIds.has('x')).toBe(false);
  });

  it('skips an ambiguous request rather than guessing when multiple attendees share the exact requested name', () => {
    const requester = createMockAttendee({ id: 'r', fullName: 'Sara', gender: Gender.FEMALE });
    const dup1 = createMockAttendee({ id: 'm1', fullName: 'Mohamed Ali', gender: Gender.FEMALE });
    const dup2 = createMockAttendee({ id: 'm2', fullName: 'Mohamed Ali', gender: Gender.FEMALE });
    const attendees = [requester, dup1, dup2];

    const classifications = new Map<string, ClassifiedNotes>([
      ['r', emptyClassification({ roommateRequests: ['Mohamed Ali'] })],
    ]);

    const result = service.createHierarchicalGroups(attendees, classifications);

    // No safe resolution exists — the requester must not be grouped together
    // with EITHER identically-named attendee (a wrong pairing is worse than
    // no pairing). It's fine for the requester to end up alone/ungrouped by
    // this phase — that's the safe outcome when resolution is ambiguous.
    const sharedGroup = result.groups.find(
      g => g.attendeeIds.has('r') && (g.attendeeIds.has('m1') || g.attendeeIds.has('m2'))
    );
    expect(sharedGroup).toBeUndefined();
  });
});

describe('AutoAssignmentService — explicit roommate group cohesion end-to-end', () => {
  class MockAttendeeRepository {
    constructor(private attendees: Attendee[]) {}
    async findAllByOrganization(): Promise<Attendee[]> {
      return this.attendees;
    }
  }

  class MockRoomRepository {
    constructor(private rooms: any[]) {}
    async findForAutoAssignment(): Promise<any[]> {
      return this.rooms;
    }
  }

  class MockRoomAssignmentRepository {
    async create(): Promise<any> {
      return {};
    }
  }

  class MockAuditLogRepository {
    async createLog(): Promise<any> {
      return {};
    }
  }

  class MockAutoAssignmentConfigRepository {
    async getOrCreateDefault(conferenceHouseId: string): Promise<any> {
      return {
        id: 'config-1',
        conferenceHouseId,
        enabledBuildings: ['building-1'],
        buildingGenderOverrides: {},
        staffReservedCapacity: 0,
        vipReservedCapacity: 0,
        emergencyReservedCapacity: 0,
        enabledRules: [],
        ruleWeights: {},
        optimizationEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
  }

  function makeRoom(overrides?: Partial<any>) {
    return {
      id: 'room-1',
      roomNumber: '101',
      roomType: RoomType.GENERAL,
      capacity: 4,
      individualBeds: 4,
      bunkBeds: 0,
      kingBeds: 0,
      floorId: 'floor-1',
      amenities: null,
      assignments: [],
      floor: {
        floorNumber: 1,
        building: { id: 'building-1', name: 'Building A', conferenceHouseId: 'house-1' }
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  it('keeps a 4-person mutual roommate request together in one room despite different ages and a medical note', async () => {
    // Mirrors the reported scenario: A wants B,C,D; B wants A,C; C wants A,D.
    // Ages span three different 5-year buckets and one member has a medical
    // note — both previously caused the group to be shredded before it ever
    // reached room placement.
    const alice = createMockAttendee({
      id: 'a', fullName: 'Alice', gender: Gender.FEMALE, age: 20,
      roomingNotes: 'I want to room with Bob, Charlie and David'
    });
    const bob = createMockAttendee({
      id: 'b', fullName: 'Bob', gender: Gender.FEMALE, age: 25,
      roomingNotes: 'with Alice and Charlie'
    });
    const charlie = createMockAttendee({
      id: 'c', fullName: 'Charlie', gender: Gender.FEMALE, age: 30,
      notes: 'medical condition — needs easy access',
      roomingNotes: 'with Alice and David'
    });
    const david = createMockAttendee({ id: 'd', fullName: 'David', gender: Gender.FEMALE, age: 35 });

    const attendees = [alice, bob, charlie, david];
    const room = makeRoom();

    const service = new AutoAssignmentService(
      new MockAttendeeRepository(attendees) as any,
      new MockRoomRepository([room]) as any,
      new MockRoomAssignmentRepository() as any,
      new MockAuditLogRepository() as any,
      new MockAutoAssignmentConfigRepository() as any,
      { useAI: false }
    );

    const params: RunAutoAssignmentDTO = {
      conferenceHouseId: 'house-1',
      buildingIds: ['building-1'],
      dryRun: true,
      options: { onlyUnassigned: false }
    };

    const result = await service.execute(params, 'org-1');

    expect(result.success).toBe(true);
    expect(result.assignments).toHaveLength(4);

    const roomIds = new Set(result.assignments.map(a => a.roomId));
    expect(roomIds.size).toBe(1); // all four landed in the SAME room

    const attendeeIds = new Set(result.assignments.map(a => a.attendeeId));
    expect(attendeeIds).toEqual(new Set(['a', 'b', 'c', 'd']));
  });
});
