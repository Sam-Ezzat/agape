// WHY: Regression coverage for the new "Area" priority grouping tier
// (HierarchicalGroupingService.createAreaGroups) — attendees from the same
// area/neighborhood should be grouped (normalized so casing/whitespace
// differences don't create false-separate groups) and, when the group can't
// fit in a single room, placed in ADJACENT rooms via the same
// proximity-based assignment already used for church/governorate/family
// groups (AutoAssignmentService.tryAssignGroupWithProximity).

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
    church: null,
    area: null,
    governorate: null,
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
    roomingNotesClassification: null,
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

describe('HierarchicalGroupingService — area grouping', () => {
  let service: HierarchicalGroupingService;

  beforeEach(() => {
    service = new HierarchicalGroupingService();
  });

  it('groups attendees from the same area, normalizing casing/whitespace differences', () => {
    const a = createMockAttendee({ id: 'a', fullName: 'Alice', area: 'Moharam Bek', gender: Gender.FEMALE });
    const b = createMockAttendee({ id: 'b', fullName: 'Bob', area: '  moharam bek  ', gender: Gender.FEMALE });
    const c = createMockAttendee({ id: 'c', fullName: 'Charlie', area: 'MOHARAM   BEK', gender: Gender.FEMALE });
    const d = createMockAttendee({ id: 'd', fullName: 'David', area: 'Hadayek El Kobba', gender: Gender.FEMALE });
    const attendees = [a, b, c, d];

    const result = service.createHierarchicalGroups(attendees, new Map<string, ClassifiedNotes>());

    const areaGroups = result.groups.filter(g => g.type === 'area');
    expect(areaGroups).toHaveLength(2);

    const moharamGroup = areaGroups.find(g => g.metadata.area === 'Moharam Bek');
    expect(moharamGroup).toBeDefined();
    expect(Array.from(moharamGroup!.attendeeIds).sort()).toEqual(['a', 'b', 'c']);

    const kobbaGroup = areaGroups.find(g => g.metadata.area === 'Hadayek El Kobba');
    expect(kobbaGroup).toBeDefined();
    expect(Array.from(kobbaGroup!.attendeeIds)).toEqual(['d']);
  });

  it('tolerates a human typo (one character off) but does NOT merge a genuinely different area', () => {
    const a = createMockAttendee({ id: 'a', fullName: 'Alice', area: 'Moharam Bek', gender: Gender.FEMALE });
    const b = createMockAttendee({ id: 'b', fullName: 'Bob', area: 'Moharam Beik', gender: Gender.FEMALE }); // one extra letter — real typo
    const c = createMockAttendee({ id: 'c', fullName: 'Charlie', area: 'Hadayek El Kobba', gender: Gender.FEMALE });
    const d = createMockAttendee({ id: 'd', fullName: 'David', area: 'Hadayek El Ahram', gender: Gender.FEMALE }); // shares a prefix, but a different, unrelated area
    const attendees = [a, b, c, d];

    const result = service.createHierarchicalGroups(attendees, new Map<string, ClassifiedNotes>());

    const areaGroups = result.groups.filter(g => g.type === 'area');
    expect(areaGroups).toHaveLength(3);

    const moharamGroup = areaGroups.find(g => g.attendeeIds.has('a'));
    expect(Array.from(moharamGroup!.attendeeIds).sort()).toEqual(['a', 'b']);

    // The two "Hadayek El ..." areas share a long common prefix but are
    // different neighborhoods — must NOT be merged just because they look
    // superficially alike.
    const kobbaGroup = areaGroups.find(g => g.attendeeIds.has('c'));
    const ahramGroup = areaGroups.find(g => g.attendeeIds.has('d'));
    expect(kobbaGroup).not.toBe(ahramGroup);
    expect(kobbaGroup!.attendeeIds.has('d')).toBe(false);
    expect(ahramGroup!.attendeeIds.has('c')).toBe(false);
  });

  it('ranks area groups ahead of church groups (priority 2 vs 3)', () => {
    const attendees = [
      createMockAttendee({ id: 'a', area: 'Moharam Bek', church: 'St. Mark' }),
      createMockAttendee({ id: 'b', area: 'Moharam Bek', church: 'St. Mark' }),
    ];

    const result = service.createHierarchicalGroups(attendees, new Map<string, ClassifiedNotes>());

    // Area grouping runs BEFORE church grouping, so these two attendees —
    // who share both — should be consumed by the area phase, not church.
    expect(result.groups.some(g => g.type === 'area')).toBe(true);
    expect(result.groups.some(g => g.type === 'church')).toBe(false);
  });
});

describe('AutoAssignmentService — area group adjacency end-to-end', () => {
  class MockAttendeeRepository {
    constructor(private attendees: Attendee[]) {}
    async findAllByOrganization(): Promise<Attendee[]> {
      return this.attendees;
    }
    async update(id: string, data: any): Promise<any> {
      return { id, ...data };
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
    async findAssignedAttendeeIds(): Promise<Set<string>> {
      return new Set();
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

  it('places a same-area group (too big for one room) into ADJACENT rooms, not a same-building-but-distant decoy room', async () => {
    // 6 attendees from the same area, no rooming notes / church in common —
    // only area grouping applies. Mirrors the proven [4,2] chunking pattern
    // from RoommateGrouping.test.ts's "leftover pair" case (same room
    // capacities), but here the room set ALSO includes a decoy room that's
    // technically in the same building but on a different, non-adjacent
    // floor — proving the adjacent pair is preferred, not just "any" rooms.
    const names = ['Person One', 'Person Two', 'Person Three', 'Person Four', 'Person Five', 'Person Six'];
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    const attendees = names.map((fullName, i) =>
      createMockAttendee({
        id: ids[i],
        fullName,
        gender: Gender.MALE,
        age: 25,
        area: i % 2 === 0 ? 'Moharam Bek' : '  MOHARAM BEK  ', // normalization exercised
      })
    );

    const rooms = [
      makeRoom({
        id: 'room-adjacent-1', roomNumber: '101', capacity: 4, individualBeds: 4,
        floor: { floorNumber: 1, building: { id: 'building-1', name: 'Building A', conferenceHouseId: 'house-1' } }
      }),
      makeRoom({
        id: 'room-adjacent-2', roomNumber: '102', capacity: 4, individualBeds: 4,
        floor: { floorNumber: 1, building: { id: 'building-1', name: 'Building A', conferenceHouseId: 'house-1' } }
      }),
      makeRoom({
        id: 'room-decoy', roomNumber: '201', capacity: 4, individualBeds: 4,
        floor: { floorNumber: 2, building: { id: 'building-1', name: 'Building A', conferenceHouseId: 'house-1' } }
      }),
    ];

    const service = new AutoAssignmentService(
      new MockAttendeeRepository(attendees) as any,
      new MockRoomRepository(rooms) as any,
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
    expect(result.assignments).toHaveLength(6);

    const roomIdsUsed = new Set(result.assignments.map(a => a.roomId));
    expect(roomIdsUsed.has('room-decoy')).toBe(false);
    expect(roomIdsUsed).toEqual(new Set(['room-adjacent-1', 'room-adjacent-2']));

    const byRoom = new Map<string, string[]>();
    for (const a of result.assignments) {
      if (!byRoom.has(a.roomId)) byRoom.set(a.roomId, []);
      byRoom.get(a.roomId)!.push(a.attendeeId);
    }
    const roomSizes = Array.from(byRoom.values()).map(m => m.length).sort((a, b) => b - a);
    expect(roomSizes).toEqual([4, 2]);

    // All assignments should be tagged as area-type group placements
    expect(result.assignments.every(a => a.groupInfo?.groupType === 'area')).toBe(true);
  });

  it('keeps a same-area group together across a wide age spread, instead of shattering it into separate age-bucket groups', async () => {
    // Regression test for the exact bug reported: without the fix, these 6
    // people (ages spanning 3 different 5-year buckets: 20s, 30s, 60s) would
    // get pulled apart by splitByAge into 3 independent groups, each placed
    // into rooms with zero coordination — "same area" ends up scattered.
    const ages = [22, 24, 35, 38, 61, 64];
    const attendees = ages.map((age, i) =>
      createMockAttendee({
        id: `p${i}`,
        fullName: `Person ${i}`,
        gender: Gender.FEMALE,
        age,
        area: 'Hadayek El Kobba',
      })
    );

    const rooms = [
      makeRoom({
        id: 'room-adjacent-1', roomNumber: '301', capacity: 4, individualBeds: 4,
        floor: { floorNumber: 3, building: { id: 'building-1', name: 'Building A', conferenceHouseId: 'house-1' } }
      }),
      makeRoom({
        id: 'room-adjacent-2', roomNumber: '302', capacity: 4, individualBeds: 4,
        floor: { floorNumber: 3, building: { id: 'building-1', name: 'Building A', conferenceHouseId: 'house-1' } }
      }),
    ];

    const service = new AutoAssignmentService(
      new MockAttendeeRepository(attendees) as any,
      new MockRoomRepository(rooms) as any,
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
    expect(result.assignments).toHaveLength(6);

    // All 6 — despite the age spread — should still be tagged as ONE
    // coordinated area placement, not scattered individual/age placements.
    expect(result.assignments.every(a => a.groupInfo?.groupType === 'area')).toBe(true);

    const roomIdsUsed = new Set(result.assignments.map(a => a.roomId));
    expect(roomIdsUsed).toEqual(new Set(['room-adjacent-1', 'room-adjacent-2']));
  });
});
