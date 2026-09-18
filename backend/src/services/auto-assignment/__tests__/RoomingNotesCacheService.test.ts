// WHY: Regression coverage for cluster expansion — after individual
// classification, every member of a mutual-request cluster should have their
// cached roommateRequests rewritten to the FULL cluster (canonical fullNames,
// including themselves), even when the request graph is only partially
// connected per-person (nobody has to list everybody).

import { describe, it, expect } from 'vitest';
import { RoomingNotesCacheService } from '../RoomingNotesCacheService';
import { Attendee, Gender, ConferenceRole, PaymentStatus } from '@prisma/client';
import { ClassifiedNotes } from '@/types/auto-assignment';

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

function classification(roommateRequests: string[], raw: string): ClassifiedNotes {
  return {
    roommateRequests,
    healthIssues: [],
    accessibility: false,
    wheelchair: false,
    elderly: false,
    nearBathroom: false,
    nearElevator: false,
    family: false,
    noPreference: false,
    other: [],
    raw,
  };
}

class MockAttendeeRepository {
  public updateCalls: Array<{ id: string; data: any }> = [];
  async update(id: string, data: any): Promise<any> {
    this.updateCalls.push({ id, data });
    return { id, ...data };
  }
}

describe('RoomingNotesCacheService.expandRoommateClusters', () => {
  it('expands a partially-connected mutual-request graph so every member lists the full cluster, including themselves', async () => {
    // Exact reported scenario:
    // A -> B,C   B -> C   C -> D,E   D -> A,E   E -> B
    // Nobody lists everybody, but the request graph is fully connected.
    const a = createMockAttendee({
      id: 'a', fullName: 'Alice', roomingNotes: 'with Bob, Charlie',
      roomingNotesClassification: classification(['Bob', 'Charlie'], 'with Bob, Charlie') as any,
    });
    const b = createMockAttendee({
      id: 'b', fullName: 'Bob', roomingNotes: 'with Charlie',
      roomingNotesClassification: classification(['Charlie'], 'with Charlie') as any,
    });
    const c = createMockAttendee({
      id: 'c', fullName: 'Charlie', roomingNotes: 'with David, Eve',
      roomingNotesClassification: classification(['David', 'Eve'], 'with David, Eve') as any,
    });
    const d = createMockAttendee({
      id: 'd', fullName: 'David', roomingNotes: 'with Alice, Eve',
      roomingNotesClassification: classification(['Alice', 'Eve'], 'with Alice, Eve') as any,
    });
    const e = createMockAttendee({
      id: 'e', fullName: 'Eve', roomingNotes: 'with Bob',
      roomingNotesClassification: classification(['Bob'], 'with Bob') as any,
    });

    const attendees = [a, b, c, d, e];
    const repo = new MockAttendeeRepository();
    const service = new RoomingNotesCacheService(repo as any);

    await service.expandRoommateClusters(attendees);

    expect(repo.updateCalls).toHaveLength(5);

    const byId = new Map(
      repo.updateCalls.map(call => [call.id, call.data.roomingNotesClassification as ClassifiedNotes])
    );
    const expectedNames = new Set(['Alice', 'Bob', 'Charlie', 'David', 'Eve']);

    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      const result = byId.get(id);
      expect(result).toBeDefined();
      // Every member — including themselves — ends up with the full cluster
      expect(new Set(result!.roommateRequests)).toEqual(expectedNames);
    }

    // The original note text must be left untouched for every member
    expect(byId.get('a')!.raw).toBe('with Bob, Charlie');
    expect(byId.get('e')!.raw).toBe('with Bob');
  });

  it('does not touch attendees outside any cluster', async () => {
    const a = createMockAttendee({
      id: 'a', fullName: 'Alice', roomingNotes: 'with Bob',
      roomingNotesClassification: classification(['Bob'], 'with Bob') as any,
    });
    const b = createMockAttendee({
      id: 'b', fullName: 'Bob', roomingNotes: null,
      roomingNotesClassification: null,
    });
    const loner = createMockAttendee({
      id: 'loner', fullName: 'Loner Person', roomingNotes: null,
      roomingNotesClassification: null,
    });

    const repo = new MockAttendeeRepository();
    const service = new RoomingNotesCacheService(repo as any);

    await service.expandRoommateClusters([a, b, loner]);

    const updatedIds = new Set(repo.updateCalls.map(c => c.id));
    expect(updatedIds.has('loner')).toBe(false);
  });

  it('ignores a stale cached classification when building the graph', async () => {
    // The cached classification's raw text no longer matches the current
    // roomingNotes — this attendee's note was edited since it was classified
    // and shouldn't be trusted to draw a connection.
    const a = createMockAttendee({
      id: 'a', fullName: 'Alice', roomingNotes: 'no preference at all',
      roomingNotesClassification: classification(['Bob'], 'with Bob') as any, // stale: raw != current notes
    });
    const b = createMockAttendee({ id: 'b', fullName: 'Bob', roomingNotes: null, roomingNotesClassification: null });

    const repo = new MockAttendeeRepository();
    const service = new RoomingNotesCacheService(repo as any);

    await service.expandRoommateClusters([a, b]);

    expect(repo.updateCalls).toHaveLength(0);
  });

  it('is idempotent — running expansion twice does not re-write already-expanded clusters', async () => {
    const a = createMockAttendee({
      id: 'a', fullName: 'Alice', roomingNotes: 'with Bob',
      roomingNotesClassification: classification(['Bob'], 'with Bob') as any,
    });
    const b = createMockAttendee({
      id: 'b', fullName: 'Bob', roomingNotes: 'with Alice',
      roomingNotesClassification: classification(['Alice'], 'with Alice') as any,
    });

    const repo = new MockAttendeeRepository();
    const service = new RoomingNotesCacheService(repo as any);

    await service.expandRoommateClusters([a, b]);
    expect(repo.updateCalls).toHaveLength(2);

    // Apply the expansion results back onto the in-memory attendees, as if
    // persisted, then run again — should be a no-op.
    const expandedA = { ...a, roomingNotesClassification: repo.updateCalls.find(c => c.id === 'a')!.data.roomingNotesClassification };
    const expandedB = { ...b, roomingNotesClassification: repo.updateCalls.find(c => c.id === 'b')!.data.roomingNotesClassification };
    repo.updateCalls = [];

    await service.expandRoommateClusters([expandedA, expandedB]);
    expect(repo.updateCalls).toHaveLength(0);
  });

  it('skips expansion for an oversized "hub" cluster instead of writing the giant merged name list into every member\'s cache', async () => {
    // 11 unrelated requesters all one-way mention the same hub attendee —
    // each mention resolves correctly, but expanding this into everyone's
    // cache is exactly the "20-30 names under one person's parsed note"
    // corruption this cap exists to prevent.
    const hub = createMockAttendee({ id: 'hub', fullName: 'Fr Mina' });
    const requesters = Array.from({ length: 10 }, (_, i) =>
      createMockAttendee({
        id: `req${i}`,
        fullName: `Requester ${i}`,
        roomingNotes: 'with Fr Mina',
        roomingNotesClassification: classification(['Fr Mina'], 'with Fr Mina') as any,
      })
    );

    const repo = new MockAttendeeRepository();
    const service = new RoomingNotesCacheService(repo as any);

    await service.expandRoommateClusters([hub, ...requesters]);

    expect(repo.updateCalls).toHaveLength(0);
  });

  it('still expands a normal small cluster when a separate oversized hub cluster exists in the same run', async () => {
    const hub = createMockAttendee({ id: 'hub', fullName: 'Fr Mina' });
    const requesters = Array.from({ length: 10 }, (_, i) =>
      createMockAttendee({
        id: `req${i}`,
        fullName: `Requester ${i}`,
        roomingNotes: 'with Fr Mina',
        roomingNotesClassification: classification(['Fr Mina'], 'with Fr Mina') as any,
      })
    );
    const a = createMockAttendee({
      id: 'a', fullName: 'Alice', roomingNotes: 'with Bob',
      roomingNotesClassification: classification(['Bob'], 'with Bob') as any,
    });
    const b = createMockAttendee({ id: 'b', fullName: 'Bob', roomingNotes: null, roomingNotesClassification: null });

    const repo = new MockAttendeeRepository();
    const service = new RoomingNotesCacheService(repo as any);

    await service.expandRoommateClusters([hub, ...requesters, a, b]);

    const updatedIds = new Set(repo.updateCalls.map(c => c.id));
    expect(updatedIds.has('a')).toBe(true);
    expect(updatedIds.has('b')).toBe(true);
    expect(updatedIds.has('hub')).toBe(false);
    expect(updatedIds.has('req0')).toBe(false);
  });
});
