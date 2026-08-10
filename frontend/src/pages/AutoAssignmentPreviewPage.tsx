import { Fragment, useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Play, RotateCcw, ArrowLeft, Download, AlertTriangle, ArrowUpDown, X, User, ArrowLeftRight, LayoutList, LayoutGrid, Search, UserMinus, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { AutoAssignmentExecutionResult, Attendee, AssignmentPreview, AuditLog } from '@/types/api';
import { autoAssignmentApi, attendeeApi, buildingApi } from '@/services/api.service';
import { toastSuccess, toastError } from '@/services/toast.service';
import { useSocket } from '@/hooks/useSocket';
import { NotificationEvent, NotificationPayload } from '@/types/notifications';
import SwapAttendeesModal from '@/components/SwapAttendeesModal';
import { SearchDualLanguageService } from '@/search/dual-language';

type SortOption = 'room' | 'attendee' | 'score' | 'building';
type ViewMode = 'list' | 'grid';
type NotesView = 'original' | 'parsed';

interface RoomCapacityInfo {
  roomId: string;
  roomNumber: string;
  buildingName: string;
  floorNumber: number;
  assignedCount: number; // TRUE total occupancy: pre-existing + newly assigned in this run
  existingCount: number; // Occupants already in the room before this run (manual or prior assignments)
  newCount: number;      // Attendees newly assigned to this room in this run
  capacity: number;
}

/**
 * Auto-Assignment Preview Results Page
 * Shows detailed preview results in a full-page view with sorting and room capacity
 */
export default function AutoAssignmentPreviewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [previewResult, setPreviewResult] = useState<AutoAssignmentExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [selectedHouseId, setSelectedHouseId] = useState<string | null>(null);
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<string[]>([]);

  // WHY: previewResult.assignments only covers rooms touched by THIS run —
  // to show truly empty rooms (and rooms with pre-existing occupants this
  // run didn't touch) we need the full room list for the selected
  // buildings, with real current occupancy from the database.
  const [allRoomsList, setAllRoomsList] = useState<RoomCapacityInfo[]>([]);

  // WHY: The draft is now a shared, backend-persisted session (not
  // localStorage) — sessionId/version are needed on every edit so the
  // server can detect if another admin changed it first (optimistic
  // concurrency). `activity` is the live "who did what" feed.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [version, setVersion] = useState<number>(1);
  const [activity, setActivity] = useState<AuditLog[]>([]);
  const [showActivity, setShowActivity] = useState(true);
  const socket = useSocket();
  const [sortBy, setSortBy] = useState<SortOption>('room');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [notesView, setNotesView] = useState<NotesView>('original');
  const [searchQuery, setSearchQuery] = useState('');

  // Attendee modal state
  const [showAttendeeModal, setShowAttendeeModal] = useState(false);
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const [isLoadingAttendee, setIsLoadingAttendee] = useState(false);
  
  // Swap modal state
  const [showSwapModal, setShowSwapModal] = useState(false);

  // Manual assignment (unassigned attendees -> rooms) state — targets the
  // same rooms already rendered in the Grid/List views below (via
  // roomCapacityMap), so no separate room fetch is needed.
  const [unassignedSearchQuery, setUnassignedSearchQuery] = useState('');
  const [unassignedGenderFilter, setUnassignedGenderFilter] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL');
  // WHY: Multi-select — a Set so several attendees can be picked (click to
  // toggle each) and assigned to one room in a single action. Deliberately
  // NOT reset by search/filter changes so typing in the search box doesn't
  // lose a selection made before searching.
  const [selectedUnassignedIds, setSelectedUnassignedIds] = useState<Set<string>>(new Set());
  const [draggedUnassignedId, setDraggedUnassignedId] = useState<string | null>(null);

  // Load the shared draft from the backend on mount — this is the source of
  // truth now (not localStorage), so this page always shows whatever the
  // current shared state is, including edits other admins already made.
  useEffect(() => {
    const houseId = searchParams.get('houseId');

    if (!houseId) {
      setIsLoadingSession(false);
      return;
    }

    setSelectedHouseId(houseId);
    setIsLoadingSession(true);
    autoAssignmentApi
      .getPreviewSession(houseId)
      .then((response) => {
        if (response) {
          setPreviewResult(response.data);
          setSessionId(response.sessionId);
          setVersion(response.version);
          setActivity(response.activity || []);
          if (response.buildingIds?.length) {
            setSelectedBuildingIds(response.buildingIds);
          }
        }
      })
      .catch((error) => console.error('Failed to load preview session:', error))
      .finally(() => setIsLoadingSession(false));
  }, [searchParams]);

  // Fetch the FULL room list (including empty ones) for the selected
  // buildings, so the preview can show every room, not just the ones this
  // run happened to touch.
  useEffect(() => {
    if (selectedBuildingIds.length === 0) {
      setAllRoomsList([]);
      return;
    }

    let cancelled = false;
    Promise.all(selectedBuildingIds.map((id) => buildingApi.getDetails(id)))
      .then((results) => {
        if (cancelled) return;
        const rooms: RoomCapacityInfo[] = [];
        results.forEach((res) => {
          if (!res.success || !res.data) return;
          const building = res.data;
          (building.floors || []).forEach((floor) => {
            (floor.rooms || []).forEach((room) => {
              const existingCount = room.assignments?.length || 0;
              rooms.push({
                roomId: room.id,
                roomNumber: room.roomNumber,
                buildingName: building.name,
                floorNumber: floor.floorNumber,
                capacity: room.capacity,
                existingCount,
                newCount: 0,
                assignedCount: existingCount,
              });
            });
          });
        });
        setAllRoomsList(rooms);
      })
      .catch((error) => console.error('Failed to load full room list:', error));

    return () => {
      cancelled = true;
    };
  }, [selectedBuildingIds]);

  // Live sync: join the conference's socket room and merge in edits other
  // admins make to this shared draft as they happen, plus append them to
  // the activity feed — no manual refresh needed.
  useEffect(() => {
    if (!socket || !selectedHouseId) return;

    socket.emit('join-conference', selectedHouseId);

    const handleUpdate = (payload: NotificationPayload) => {
      const data = payload.data as { sessionId?: string; version?: number; activitySummary?: string; actor?: { name: string } } | undefined;
      if (!data?.sessionId || data.sessionId !== sessionId) return;
      // Skip echoes of an update this tab already applied.
      if (data.version !== undefined && data.version <= version) return;

      autoAssignmentApi.getPreviewSession(selectedHouseId).then((response) => {
        if (response) {
          setPreviewResult(response.data);
          setVersion(response.version);
          setActivity(response.activity || []);
        }
      });

      if (data.actor?.name && data.activitySummary) {
        toastSuccess(`${data.actor.name} ${data.activitySummary}`);
      }
    };

    socket.on(NotificationEvent.PREVIEW_SESSION_UPDATED, handleUpdate);
    return () => {
      socket.off(NotificationEvent.PREVIEW_SESSION_UPDATED, handleUpdate);
      socket.emit('leave-conference', selectedHouseId);
    };
  }, [socket, selectedHouseId, sessionId, version]);

  // Calculate room capacity information
  const roomCapacityMap = useMemo<Map<string, RoomCapacityInfo>>(() => {
    const map = new Map<string, RoomCapacityInfo>();

    // Baseline: every real room in the selected buildings — including empty
    // ones — seeded at zero occupancy. Once `allRoomsList` has loaded, this
    // is what makes empty rooms visible.
    allRoomsList.forEach((room) => {
      map.set(room.roomId, { ...room, assignedCount: 0, existingCount: 0, newCount: 0 });
    });

    // WHY: Real, already-assigned attendees are now seeded as `isExisting`
    // entries in `previewResult.assignments` alongside this run's new
    // placements (see PreviewSessionService.getOrCreateSession) — a SINGLE
    // pass over the current, possibly-edited assignments list is both
    // simpler than a separate "baseline occupancy + overlay" split AND
    // correctly reflects a MOVED real attendee (they only count toward
    // their current roomId, not wherever they started).
    (previewResult?.assignments || []).forEach((assignment) => {
      const existing = map.get(assignment.roomId);
      if (existing) {
        existing.assignedCount += 1;
        if (assignment.isExisting) existing.existingCount += 1;
        else existing.newCount += 1;
      } else {
        // Baseline room list hasn't loaded yet (or doesn't cover this room)
        // — fall back to the assignment's own room info, as before.
        const capacity = assignment.roomCapacity || 0;
        map.set(assignment.roomId, {
          roomId: assignment.roomId,
          roomNumber: assignment.roomNumber,
          buildingName: assignment.buildingName,
          floorNumber: assignment.floorNumber,
          assignedCount: 1,
          existingCount: assignment.isExisting ? 1 : 0,
          newCount: assignment.isExisting ? 0 : 1,
          capacity,
        });
      }
    });

    return map;
  }, [allRoomsList, previewResult?.assignments]);

  // Dual-language (Arabic/English) fuzzy name search — same engine used on the Attendees page
  const dualLanguageSearch = useMemo(() => new SearchDualLanguageService(), []);

  // Search across attendee name (dual-language), room number, rooming notes,
  // age, building, and floor — a single query box matching "any kind of data"
  const filteredAssignments = useMemo(() => {
    const assignments = previewResult?.assignments || [];
    const query = searchQuery.trim();
    if (!query) return assignments;

    // Name matching goes through the dual-language engine the same way the
    // Attendees page does: generate normalized/transliterated/dictionary
    // candidate strings for the query, then substring-match them against each
    // attendee's name — NOT whole-string similarity scoring. searchWithScoring()
    // compares the ENTIRE query against the ENTIRE name via Levenshtein distance
    // against a 70% threshold, which is designed for "is this candidate
    // approximately equal to this text" (typo correction), not "does this
    // longer name contain what I typed" — a short query like "Ahmed" against a
    // full name "Ahmed Mohamed Ali" scores far below 70% and was silently
    // filtered out, which is why name search wasn't returning results.
    const queryLower = query.toLowerCase();
    const nameCandidates = [queryLower, ...dualLanguageSearch.generateSearchCandidates(query).map(c => c.toLowerCase())];
    const nameMatchIds = new Set(
      assignments
        .filter((a) => {
          const nameLower = a.attendeeName.toLowerCase();
          return nameCandidates.some((candidate) => candidate && nameLower.includes(candidate));
        })
        .map((a) => a.attendeeId)
    );

    return assignments.filter((a) => {
      if (nameMatchIds.has(a.attendeeId)) return true;
      const plainFields = [
        a.roomNumber,
        a.buildingName,
        String(a.floorNumber ?? ''),
        a.age != null ? String(a.age) : '',
        a.roomingNotes || '',
        a.parsedRoomingNotes || '',
        a.church || '',
        a.governorate || '',
        a.area || '',
      ];
      return plainFields.some((field) => field.toLowerCase().includes(queryLower));
    });
  }, [previewResult?.assignments, searchQuery, dualLanguageSearch]);

  // Search across unassigned attendees — name via the dual-language engine
  // (same as the main search above), plus rooming notes/area/governorate/
  // church via plain substring matching.
  const filteredUnassignedAttendees = useMemo(() => {
    let unassigned = previewResult?.unassignedAttendees || [];

    if (unassignedGenderFilter !== 'ALL') {
      unassigned = unassigned.filter((u) => (u.gender || '').toUpperCase() === unassignedGenderFilter);
    }

    const query = unassignedSearchQuery.trim();
    if (!query) return unassigned;

    const queryLower = query.toLowerCase();
    const nameCandidates = [queryLower, ...dualLanguageSearch.generateSearchCandidates(query).map(c => c.toLowerCase())];

    return unassigned.filter((u) => {
      const nameLower = u.name.toLowerCase();
      if (nameCandidates.some((candidate) => candidate && nameLower.includes(candidate))) return true;

      const plainFields = [u.roomingNotes || '', u.area || '', u.governorate || '', u.church || ''];
      return plainFields.some((field) => field.toLowerCase().includes(queryLower));
    });
  }, [previewResult?.unassignedAttendees, unassignedSearchQuery, unassignedGenderFilter, dualLanguageSearch]);

  // A room (from roomCapacityMap, the same rooms already shown in the
  // Grid/List views below) is a valid drop/click target while it has space.
  const isRoomFull = (room: RoomCapacityInfo): boolean => room.assignedCount >= room.capacity;

  // Sort assignments based on selected sort option
  const sortedAssignments = useMemo(() => {
    if (filteredAssignments.length === 0) return [];

    const assignments = [...filteredAssignments];

    switch (sortBy) {
      case 'room':
        return assignments.sort((a, b) => {
          // CRITICAL: Sort by roomId first to ensure all attendees in same room are together
          // This prevents other rooms from intersecting the same room's rows
          if (a.roomId !== b.roomId) {
            // WHY: Order by the room's own numeric sequence first (e.g. C1,
            // C2, ... C55), NOT by which building it happens to belong to —
            // buildings often just carve up one continuous room range, so
            // grouping by building name first would scatter C1-19/C20-40/
            // C41-55 out of order. Building/floor are only tiebreakers for
            // the rare case of a genuine room-number collision.
            const roomCompare = a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
            if (roomCompare !== 0) return roomCompare;
            if (a.floorNumber !== b.floorNumber) {
              return a.floorNumber - b.floorNumber;
            }
            return a.buildingName.localeCompare(b.buildingName, undefined, { numeric: true });
          }
          // Same room: sort by attendee name for consistency
          return a.attendeeName.localeCompare(b.attendeeName);
        });
      case 'attendee':
        return assignments.sort((a, b) => a.attendeeName.localeCompare(b.attendeeName));
      case 'score':
        return assignments.sort((a, b) => b.score - a.score); // Descending
      case 'building':
        return assignments.sort((a, b) => {
          if (a.buildingName !== b.buildingName) {
            return a.buildingName.localeCompare(b.buildingName, undefined, { numeric: true });
          }
          return a.attendeeName.localeCompare(b.attendeeName);
        });
      default:
        return assignments;
    }
  }, [filteredAssignments, sortBy]);

  // Group assignments by room for the grid view — seeded from EVERY known
  // room (including empty ones), not just rooms that ended up with an
  // assignment, so fully-empty rooms still show up as (draggable) cards.
  const roomsGrouped = useMemo(() => {
    const groups = new Map<string, { info: RoomCapacityInfo; assignments: AssignmentPreview[] }>();

    roomCapacityMap.forEach((info, roomId) => {
      groups.set(roomId, { info, assignments: [] });
    });

    filteredAssignments.forEach((assignment) => {
      const group = groups.get(assignment.roomId);
      if (group) group.assignments.push(assignment);
    });

    const query = searchQuery.trim().toLowerCase();
    let rooms = Array.from(groups.values());

    if (query) {
      // WHY: An empty room only earns a place in filtered results if the
      // search itself matches the room (number/building/floor) — otherwise
      // every empty room would clutter an unrelated attendee-name search.
      rooms = rooms.filter(
        (room) =>
          room.assignments.length > 0 ||
          [room.info.roomNumber, room.info.buildingName, String(room.info.floorNumber)].some((field) =>
            field.toLowerCase().includes(query)
          )
      );
    }

    rooms.forEach((room) => {
      room.assignments.sort((a, b) => a.attendeeName.localeCompare(b.attendeeName));
    });
    rooms.sort((a, b) => {
      // WHY: Same priority as the list view's "room" sort — order by the
      // room's own numeric sequence first, not by building name, so a
      // continuous room range spread across buildings (e.g. C1-19 in
      // Orange, C20-40 in Apple, C41-55 in Mango) still displays in order.
      const roomCompare = a.info.roomNumber.localeCompare(b.info.roomNumber, undefined, { numeric: true });
      if (roomCompare !== 0) return roomCompare;
      if (a.info.floorNumber !== b.info.floorNumber) {
        return a.info.floorNumber - b.info.floorNumber;
      }
      return a.info.buildingName.localeCompare(b.info.buildingName, undefined, { numeric: true });
    });

    return rooms;
  }, [filteredAssignments, roomCapacityMap, searchQuery]);

  // Empty rooms (zero occupants) for the List view — the list view is
  // assignment-row-driven so a room with no assignments has no row to
  // attach a header to; shown instead as their own compact, still-droppable
  // section rather than restructuring the whole table.
  const emptyRoomsList = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let rooms = Array.from(roomCapacityMap.values()).filter((room) => room.assignedCount === 0);

    if (query) {
      rooms = rooms.filter((room) =>
        [room.roomNumber, room.buildingName, String(room.floorNumber)].some((field) =>
          field.toLowerCase().includes(query)
        )
      );
    }

    return rooms.sort((a, b) => {
      const roomCompare = a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
      if (roomCompare !== 0) return roomCompare;
      if (a.floorNumber !== b.floorNumber) return a.floorNumber - b.floorNumber;
      return a.buildingName.localeCompare(b.buildingName, undefined, { numeric: true });
    });
  }, [roomCapacityMap, searchQuery]);

  const handleConfirmAndExecute = async () => {
    if (!sessionId) {
      toastError('Missing preview session — reopen the preview and try again');
      return;
    }

    try {
      setIsExecuting(true);

      const response = await autoAssignmentApi.executePreviewSession(sessionId);

      if (response.success) {
        toastSuccess(`Successfully assigned ${response.data.assignmentsCreated} attendees`);
        navigate('/auto-assignment');
      }
    } catch (error) {
      console.error('Execution error:', error);
      toastError('Failed to execute assignments');
    } finally {
      setIsExecuting(false);
    }
  };

  // WHY: Central save path for every manual edit on this page (unassign,
  // assign, swap). The draft is a shared backend session now, so edits go
  // through the server with the current `version` — if another admin saved
  // an edit first, the server rejects this one (409) instead of silently
  // overwriting it, and we refresh to their latest state instead.
  const saveEdit = async (updatedPreview: AutoAssignmentExecutionResult, activitySummary: string): Promise<boolean> => {
    if (!sessionId) {
      toastError('Missing preview session — reopen the preview and try again');
      return false;
    }

    const result = await autoAssignmentApi.applyPreviewEdit(sessionId, version, updatedPreview, activitySummary);

    if (!result.success) {
      if (result.conflict) {
        toastError(result.message || 'This draft was just changed by another admin — showing the latest version.');
        setPreviewResult(result.data);
        setVersion(result.version);
      }
      return false;
    }

    setPreviewResult(result.data);
    setVersion(result.version);
    return true;
  };

  const handleSwapComplete = () => {
    // The swap itself already saved via handlePreviewSwap below (which
    // calls saveEdit) — nothing further to reload here.
    toastSuccess('Swap completed! Preview updated.');
  };

  // WHY: This is a shared draft — nothing has been persisted to real
  // RoomAssignment rows yet, so "unassigning" just edits the draft (sent
  // back to the server so other admins see it too). This makes rooms
  // easier to review and frees the attendee up to be handled differently —
  // either re-run auto-assignment, or place them manually.
  const handleUnassignFromPreview = async (attendeeId: string, attendeeName: string) => {
    if (!previewResult?.assignments) return;

    const removedAssignment = previewResult.assignments.find(a => a.attendeeId === attendeeId);
    const updatedAssignments = previewResult.assignments.filter(a => a.attendeeId !== attendeeId);

    // Send the attendee back to the "Unassigned" sidebar so they aren't lost
    // from the preview entirely — mirrors handleAssignUnassignedToRoom below.
    const updatedUnassigned = removedAssignment
      ? [
          ...(previewResult.unassignedAttendees || []),
          {
            id: removedAssignment.attendeeId,
            name: removedAssignment.attendeeName,
            reason: 'Manually unassigned from preview',
            roomingNotes: removedAssignment.roomingNotes,
            area: removedAssignment.area,
            governorate: removedAssignment.governorate,
            church: removedAssignment.church,
            age: removedAssignment.age,
            gender: removedAssignment.gender,
            // WHY: carried through so committing the draft releases their
            // REAL room assignment, not just drops a draft-only row.
            originalRoomId: removedAssignment.isExisting
              ? removedAssignment.originalRoomId ?? removedAssignment.roomId
              : undefined,
          },
        ]
      : previewResult.unassignedAttendees;

    const updatedPreview = {
      ...previewResult,
      assignments: updatedAssignments,
      unassignedAttendees: updatedUnassigned,
      // Keep the "Assignments Created" summary card in sync — it's otherwise
      // a static count from the original run and wouldn't reflect the removal.
      assignmentsCreated: updatedAssignments.length,
    };

    const saved = await saveEdit(
      updatedPreview,
      `unassigned ${attendeeName}${removedAssignment ? ` from Room ${removedAssignment.roomNumber}` : ''}`
    );
    if (saved) {
      toastSuccess(`${attendeeName} moved to unassigned in the preview`);
    }
  };

  // WHY: Manually placing unassigned attendee(s) into a room here is ALSO a
  // shared draft edit, not a real database write — consistent with unassign/
  // swap above, everything on this page stays a draft until Confirm & Execute.
  // Accepts multiple IDs so a multi-selection can be assigned to one room in
  // a single action instead of one at a time.
  const handleAssignUnassignedToRoom = async (attendeeIds: string[], room: RoomCapacityInfo) => {
    if (!previewResult || attendeeIds.length === 0) return;

    const unassignedEntries = attendeeIds
      .map((id) => previewResult.unassignedAttendees?.find(u => u.id === id))
      .filter((u): u is NonNullable<typeof u> => Boolean(u));
    if (unassignedEntries.length === 0) return;

    const remainingSpace = room.capacity - room.assignedCount;
    if (remainingSpace <= 0) {
      toastError(`Room ${room.roomNumber} is already full`);
      return;
    }
    if (unassignedEntries.length > remainingSpace) {
      toastError(`Room ${room.roomNumber} only has ${remainingSpace} space(s) left — ${unassignedEntries.length} selected`);
      return;
    }

    const newAssignments: AssignmentPreview[] = unassignedEntries.map((entry) => ({
      attendeeId: entry.id,
      attendeeName: entry.name,
      gender: entry.gender || undefined,
      age: entry.age ?? undefined,
      church: entry.church,
      area: entry.area,
      governorate: entry.governorate,
      roomingNotes: entry.roomingNotes,
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      buildingName: room.buildingName,
      floorNumber: room.floorNumber,
      roomCapacity: room.capacity,
      existingOccupancy: room.existingCount,
      score: 1,
      appliedRules: ['manual_assignment'],
      reason: 'Manually assigned during preview review',
      // WHY: preserve real-attendee identity across an unassign→reassign
      // round trip so commit still knows this is a move (or a no-op if
      // they land back in their original room), not a fresh insert.
      isExisting: Boolean(entry.originalRoomId),
      originalRoomId: entry.originalRoomId,
    }));

    const assignedIds = new Set(unassignedEntries.map((entry) => entry.id));
    const updatedAssignments = [...(previewResult.assignments || []), ...newAssignments];
    const updatedUnassigned = (previewResult.unassignedAttendees || []).filter(u => !assignedIds.has(u.id));
    const updatedPreview = {
      ...previewResult,
      assignments: updatedAssignments,
      unassignedAttendees: updatedUnassigned,
      assignmentsCreated: updatedAssignments.length,
    };

    const names = unassignedEntries.map((entry) => entry.name).join(', ');
    const saved = await saveEdit(updatedPreview, `assigned ${names} to Room ${room.roomNumber}`);
    if (saved) {
      toastSuccess(
        unassignedEntries.length === 1
          ? `${unassignedEntries[0]!.name} assigned to Room ${room.roomNumber}`
          : `${unassignedEntries.length} attendees assigned to Room ${room.roomNumber}`
      );
      setSelectedUnassignedIds(new Set());
    }
    setDraggedUnassignedId(null);
  };

  // WHY: Dragging a card that's part of the current multi-selection should
  // move the WHOLE selection; dragging a card that ISN'T selected should
  // just move that one card (matches common file-manager drag behavior).
  const getUnassignedIdsToMove = (draggedId: string): string[] =>
    selectedUnassignedIds.has(draggedId) ? Array.from(selectedUnassignedIds) : [draggedId];

  const handlePreviewSwap = async (groupA: string[], groupB: string[], targetRoomId?: string) => {
    if (!previewResult?.assignments) {
      toastError('No preview data available');
      return { success: false };
    }

    // Find assignments for Group A
    const groupAAssignments = previewResult.assignments.filter(a => groupA.includes(a.attendeeId));

    if (groupAAssignments.length !== groupA.length) {
      toastError('Some attendees in Group A not found in preview');
      return { success: false };
    }

    if (groupAAssignments.length === 0) {
      toastError('Cannot swap: Group A has no assignments');
      return { success: false };
    }

    // CASE 1: Move operation (Group A → Target Room)
    if (targetRoomId && groupB.length === 0) {
      // Find the target room info from any assignment in that room — but
      // fall back to roomCapacityMap (which also covers fully empty rooms)
      // since a genuinely empty room has no assignment to read this from.
      const targetRoomAssignment = previewResult.assignments.find(a => a.roomId === targetRoomId);
      const targetRoomCapacityInfo = roomCapacityMap.get(targetRoomId);

      if (!targetRoomAssignment && !targetRoomCapacityInfo) {
        toastError('Target room not found in preview');
        return { success: false };
      }

      const targetRoomInfo = targetRoomAssignment
        ? {
            roomId: targetRoomAssignment.roomId,
            roomNumber: targetRoomAssignment.roomNumber,
            buildingName: targetRoomAssignment.buildingName,
            floorNumber: targetRoomAssignment.floorNumber,
            roomCapacity: targetRoomAssignment.roomCapacity,
          }
        : {
            roomId: targetRoomId,
            roomNumber: targetRoomCapacityInfo!.roomNumber,
            buildingName: targetRoomCapacityInfo!.buildingName,
            floorNumber: targetRoomCapacityInfo!.floorNumber,
            roomCapacity: targetRoomCapacityInfo!.capacity,
          };

      // Move Group A to target room
      const updatedAssignments = previewResult.assignments.map(assignment => {
        if (groupA.includes(assignment.attendeeId)) {
          return {
            ...assignment,
            roomId: targetRoomInfo.roomId,
            roomNumber: targetRoomInfo.roomNumber,
            buildingName: targetRoomInfo.buildingName,
            floorNumber: targetRoomInfo.floorNumber,
            roomCapacity: targetRoomInfo.roomCapacity,
            reason: assignment.reason + ' (manually moved)',
          };
        }
        return assignment;
      });

      // Update preview result
      const updatedPreview = {
        ...previewResult,
        assignments: updatedAssignments,
      };

      const groupANames = groupAAssignments.map(a => a.attendeeName).join(', ');
      const saved = await saveEdit(updatedPreview, `moved ${groupANames} to Room ${targetRoomInfo.roomNumber}`);
      if (!saved) return { success: false };

      return { success: true, data: { valid: true } };
    }

    // CASE 2: Swap operation (Group A ↔ Group B)
    const groupBAssignments = previewResult.assignments.filter(a => groupB.includes(a.attendeeId));

    if (groupBAssignments.length !== groupB.length) {
      toastError('Some attendees in Group B not found in preview');
      return { success: false };
    }

    if (groupBAssignments.length === 0) {
      toastError('Cannot swap: Group B has no assignments');
      return { success: false };
    }

    // Get the room info from each group (use first assignment as reference)
    const groupARoomInfo = {
      roomId: groupAAssignments[0]!.roomId,
      roomNumber: groupAAssignments[0]!.roomNumber,
      buildingName: groupAAssignments[0]!.buildingName,
      floorNumber: groupAAssignments[0]!.floorNumber,
      roomCapacity: groupAAssignments[0]!.roomCapacity,
    };

    const groupBRoomInfo = {
      roomId: groupBAssignments[0]!.roomId,
      roomNumber: groupBAssignments[0]!.roomNumber,
      buildingName: groupBAssignments[0]!.buildingName,
      floorNumber: groupBAssignments[0]!.floorNumber,
      roomCapacity: groupBAssignments[0]!.roomCapacity,
    };

    // Create updated assignments with swapped rooms
    const updatedAssignments = previewResult.assignments.map(assignment => {
      // If this assignment is in Group A, move to Group B's room
      if (groupA.includes(assignment.attendeeId)) {
        return {
          ...assignment,
          roomId: groupBRoomInfo.roomId,
          roomNumber: groupBRoomInfo.roomNumber,
          buildingName: groupBRoomInfo.buildingName,
          floorNumber: groupBRoomInfo.floorNumber,
          roomCapacity: groupBRoomInfo.roomCapacity,
          reason: assignment.reason + ' (manually swapped)',
        };
      }
      
      // If this assignment is in Group B, move to Group A's room
      if (groupB.includes(assignment.attendeeId)) {
        return {
          ...assignment,
          roomId: groupARoomInfo.roomId,
          roomNumber: groupARoomInfo.roomNumber,
          buildingName: groupARoomInfo.buildingName,
          floorNumber: groupARoomInfo.floorNumber,
          roomCapacity: groupARoomInfo.roomCapacity,
          reason: assignment.reason + ' (manually swapped)',
        };
      }
      
      // Otherwise, keep as is
      return assignment;
    });

    // Update preview result
    const updatedPreview = {
      ...previewResult,
      assignments: updatedAssignments,
    };

    const groupANames = groupAAssignments.map(a => a.attendeeName).join(', ');
    const groupBNames = groupBAssignments.map(a => a.attendeeName).join(', ');
    const saved = await saveEdit(
      updatedPreview,
      `swapped ${groupANames} (Room ${groupARoomInfo.roomNumber}) with ${groupBNames} (Room ${groupBRoomInfo.roomNumber})`
    );
    if (!saved) return { success: false };

    return { success: true, data: { valid: true } };
  };

  const handleAttendeeClick = async (attendeeId: string) => {
    try {
      setIsLoadingAttendee(true);
      setShowAttendeeModal(true);
      
      const response = await attendeeApi.getById(attendeeId);
      
      if (response.success && response.data) {
        setSelectedAttendee(response.data);
      } else {
        toastError('Failed to load attendee details');
        setShowAttendeeModal(false);
      }
    } catch (error) {
      console.error('Error fetching attendee:', error);
      toastError('Failed to load attendee details');
      setShowAttendeeModal(false);
    } finally {
      setIsLoadingAttendee(false);
    }
  };

  const handleCloseModal = () => {
    setShowAttendeeModal(false);
    setSelectedAttendee(null);
  };

  // WHY: Deliberately does NOT discard the session — this is the "soft" way
  // back (e.g. accidentally clicking the arrow, or briefly checking the
  // config screen). The draft lives on the backend now (shared across
  // admins) so it's still there — for anyone — when reopened.
  const handleBackToConfig = () => {
    navigate('/auto-assignment');
  };

  // WHY: An explicit, deliberate reset — discards the SHARED draft on the
  // backend (not just this tab's view of it), so any other admin currently
  // looking at it will also see it gone. Used by both "Clear & Start Over"
  // and "Exit Preview".
  const discardSessionAndLeave = async () => {
    if (sessionId) {
      try {
        await autoAssignmentApi.discardPreviewSession(sessionId);
      } catch (error) {
        console.error('Failed to discard preview session:', error);
      }
    }
    setPreviewResult(null);
    navigate('/auto-assignment');
  };

  const handleClearPreview = () => {
    discardSessionAndLeave();
  };

  // WHY: A distinct, explicit "I'm done reviewing this" action — same full
  // reset as Clear & Start Over, but framed as leaving the preview flow
  // entirely (vs. "reset and immediately try different settings").
  const handleExitPreview = async () => {
    await discardSessionAndLeave();
    toastSuccess('Preview closed — ready for a new dry run');
  };

  const handleExportCSV = () => {
    if (!sortedAssignments || sortedAssignments.length === 0) return;

    const headers = ['#', 'Attendee', 'Room', 'Room Capacity', 'Building', 'Floor', 'Score', 'Group Type', 'Roommates Together', 'Reasoning'];
    const rows = sortedAssignments.map((assignment, idx) => {
      const roomCapacity = roomCapacityMap.get(assignment.roomId);
      const capacityStr = roomCapacity ? `${roomCapacity.assignedCount}/${roomCapacity.capacity}` : '';
      
      return [
        idx + 1,
        assignment.attendeeName || '',
        assignment.roomNumber || '',
        capacityStr,
        assignment.buildingName || '',
        assignment.floorNumber || '',
        `${(assignment.score * 100).toFixed(0)}%`,
        assignment.groupInfo?.groupType || 'individual',
        assignment.groupInfo?.roommatesInSameRoom 
          ? `${assignment.groupInfo.roommatesInSameRoom}/${assignment.groupInfo.groupSize}`
          : '',
        assignment.reason || ''
      ];
    });

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auto-assignment-preview-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoadingSession) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!previewResult) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Preview Results</h2>
          <p className="text-gray-600 mb-4">Run a preview from the Auto-Assignment page first.</p>
          <button
            onClick={handleBackToConfig}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Auto-Assignment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBackToConfig}
                className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Assignment Preview Results</h1>
                <p className="text-sm text-gray-600 mt-1">
                  {previewResult.assignments?.length || 0} assignments • {previewResult.executionTimeMs}ms execution time
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSwapModal(true)}
                className="px-2.5 py-1.5 border border-blue-300 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1.5 text-sm"
              >
                <ArrowLeftRight size={14} />
                Swap Attendees
              </button>
              <button
                onClick={handleExportCSV}
                className="px-2.5 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 text-sm"
              >
                <Download size={14} />
                Export CSV
              </button>
              <button
                onClick={handleClearPreview}
                className="px-2.5 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 text-sm"
              >
                <RotateCcw size={14} />
                Clear & Start Over
              </button>
              <button
                onClick={handleExitPreview}
                title="Close this preview and reset — the next dry run starts completely fresh"
                className="px-2.5 py-1.5 border border-red-300 text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1.5 text-sm"
              >
                <X size={14} />
                Exit Preview
              </button>
              <button
                onClick={handleConfirmAndExecute}
                disabled={isExecuting}
                className="px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 text-sm font-medium"
              >
                {isExecuting ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play size={15} />
                    Confirm & Execute
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Search — kept inside the same sticky header bar so it stays
              visible while scrolling, instead of scrolling away with the
              summary cards/table below. */}
          <div className="pb-4">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by attendee name (Arabic or English), room number, rooming notes, age, building, or floor..."
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            {searchQuery.trim() && (
              <div className="text-xs text-gray-500 mt-2">
                {filteredAssignments.length} of {previewResult.assignments?.length || 0} assignments match "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="min-w-0">
        {/* Summary Cards */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Assignments Created</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">
              {(previewResult.assignments || []).filter((a) => !a.isExisting).length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Rooms Used</div>
            <div className="text-2xl font-bold text-indigo-600 mt-1">
              {Array.from(roomCapacityMap.values()).filter((r) => r.assignedCount > 0).length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Attendees Processed</div>
            <div className="text-2xl font-bold text-green-600 mt-1">
              {previewResult.attendeesProcessed || 0}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Unassigned</div>
            <div className="text-2xl font-bold text-orange-600 mt-1">
              {previewResult.unassignedAttendees?.length || 0}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Execution Time</div>
            <div className="text-2xl font-bold text-purple-600 mt-1">
              {previewResult.executionTimeMs}ms
            </div>
          </div>
        </div>

        {/* Sort & View Controls */}
        <div className="bg-white rounded-lg shadow px-6 py-4 mb-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <ArrowUpDown size={18} className="text-gray-500" />
            <label className="text-sm font-medium text-gray-700">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="room">Room Number</option>
              <option value="attendee">Attendee Name</option>
              <option value="score">Match Score</option>
              <option value="building">Building</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Notes:</label>
            <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
              <button
                onClick={() => setNotesView('original')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  notesView === 'original' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
                title="Show the raw rooming note as written"
              >
                Original
              </button>
              <button
                onClick={() => setNotesView('parsed')}
                className={`px-3 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                  notesView === 'parsed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
                title="Show the clean list of names the AI extracted from the note"
              >
                Parsed
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {sortBy === 'room' && viewMode === 'list' && (
              <div className="text-sm text-gray-600">
                <span className="font-medium">Room View:</span> Assignments grouped by room with capacity indicators
              </div>
            )}
            <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors ${
                  viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <LayoutList size={16} />
                List
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors border-l border-gray-300 ${
                  viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <LayoutGrid size={16} />
                Grid
              </button>
            </div>
          </div>
        </div>

        {/* Grid View: Room Cards, 3-per-row responsive */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {roomsGrouped.map((room) => {
              const capacityPercent = room.info.capacity
                ? (room.info.assignedCount / room.info.capacity) * 100
                : 0;
              const roomIsFull = isRoomFull(room.info);
              const isDropTarget = Boolean(draggedUnassignedId || selectedUnassignedIds.size > 0);

              return (
                <div
                  key={room.info.roomId}
                  onDragOver={(e) => { if (draggedUnassignedId && !roomIsFull) e.preventDefault(); }}
                  onDrop={() => draggedUnassignedId && handleAssignUnassignedToRoom(getUnassignedIdsToMove(draggedUnassignedId), room.info)}
                  onClick={() => selectedUnassignedIds.size > 0 && !roomIsFull && handleAssignUnassignedToRoom(Array.from(selectedUnassignedIds), room.info)}
                  className={`bg-white rounded-lg shadow overflow-hidden flex flex-col transition-all ${
                    isDropTarget && !roomIsFull
                      ? 'ring-2 ring-primary-400 cursor-pointer'
                      : isDropTarget && roomIsFull
                      ? 'opacity-60'
                      : ''
                  }`}
                >
                  {/* Room Card Header */}
                  <div className="bg-blue-50 border-b border-blue-200 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-blue-900">Room {room.info.roomNumber}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          capacityPercent >= 100
                            ? 'bg-green-100 text-green-800'
                            : capacityPercent >= 75
                            ? 'bg-blue-100 text-blue-800'
                            : capacityPercent >= 50
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}
                      >
                        {room.info.assignedCount}/{room.info.capacity}
                      </span>
                    </div>
                    <div className="text-xs text-blue-700 mt-0.5">
                      {room.info.buildingName} • Floor {room.info.floorNumber}
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full transition-all ${
                          capacityPercent >= 100
                            ? 'bg-green-500'
                            : capacityPercent >= 75
                            ? 'bg-blue-500'
                            : capacityPercent >= 50
                            ? 'bg-yellow-500'
                            : 'bg-orange-500'
                        }`}
                        style={{ width: `${Math.min(capacityPercent, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Attendee List */}
                  <div className="px-4 py-3 flex-1 space-y-2">
                    {room.assignments.map((assignment) => (
                      <div key={assignment.attendeeId} className="text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAttendeeClick(assignment.attendeeId); }}
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1.5 transition-colors min-w-0"
                          >
                            <User size={13} className="shrink-0" />
                            <span className="truncate">{assignment.attendeeName}</span>
                          </button>
                          {assignment.isExisting ? (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700">
                              Already Assigned
                            </span>
                          ) : (
                            <span
                              className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${
                                assignment.score >= 0.8
                                  ? 'bg-green-100 text-green-800'
                                  : assignment.score >= 0.6
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-orange-100 text-orange-800'
                              }`}
                            >
                              {(assignment.score * 100).toFixed(0)}%
                            </span>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleUnassignFromPreview(assignment.attendeeId, assignment.attendeeName); }}
                            className="shrink-0 text-gray-400 hover:text-red-600 transition-colors"
                            title="Unassign from this room (preview only)"
                          >
                            <UserMinus size={14} />
                          </button>
                        </div>
                        {(assignment.church || assignment.governorate || assignment.area) && (
                          <p className="text-xs text-gray-500 pl-5 truncate">
                            {[assignment.church, assignment.governorate, assignment.area].filter(Boolean).join(' • ')}
                          </p>
                        )}
                        {notesView === 'parsed' ? (
                          assignment.parsedRoomingNotes ? (
                            <div className="text-xs text-gray-500 pl-5 mt-0.5 whitespace-pre-wrap break-words">
                              📝 {assignment.parsedRoomingNotes}
                            </div>
                          ) : assignment.roomingNotes ? (
                            <div className="text-xs text-gray-400 italic pl-5 mt-0.5">
                              Not parsed yet — showing original: "{assignment.roomingNotes}"
                            </div>
                          ) : null
                        ) : (
                          assignment.roomingNotes && (
                            <div className="text-xs text-gray-500 pl-5 mt-0.5 whitespace-pre-wrap break-words">
                              📝 {assignment.roomingNotes}
                            </div>
                          )
                        )}
                      </div>
                    ))}
                    {draggedUnassignedId && !roomIsFull && (
                      <p className="text-xs text-primary-600 font-medium pt-1 border-t border-dashed border-primary-300">
                        Drop to assign here
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Assignments Table */}
        {viewMode === 'list' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attendee</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Building</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Floor</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-1/2">Match Analysis</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedAssignments.map((assignment, idx) => {
                  // Check if we need to show a room header (when sorted by room and it's a new room)
                  const prevAssignment = idx > 0 ? sortedAssignments[idx - 1] : null;
                  const nextAssignment = idx < sortedAssignments.length - 1 ? sortedAssignments[idx + 1] : null;
                  const showRoomHeader = sortBy === 'room' && 
                    (idx === 0 || (prevAssignment && prevAssignment.roomId !== assignment.roomId));
                  const isLastInRoom = sortBy === 'room' && 
                    (!nextAssignment || nextAssignment.roomId !== assignment.roomId);
                  
                  const roomCapacity = roomCapacityMap.get(assignment.roomId);
                  const capacityPercent = roomCapacity 
                    ? (roomCapacity.assignedCount / roomCapacity.capacity) * 100 
                    : 0;

                  return (
                    <Fragment key={assignment.attendeeId}>
                      {/* Divider between room groups (not before first room) */}
                      {showRoomHeader && idx > 0 && (
                        <tr key={`divider-${assignment.roomId}`} className="border-t-4 border-gray-300">
                          <td colSpan={8} className="h-0 p-0"></td>
                        </tr>
                      )}
                      
                      {/* Room Header Row (only when sorted by room) */}
                      {showRoomHeader && roomCapacity && (() => {
                        const roomIsFull = isRoomFull(roomCapacity);
                        const isDropTarget = Boolean(draggedUnassignedId || selectedUnassignedIds.size > 0);
                        return (
                        <tr
                          key={`header-${assignment.roomId}`}
                          onDragOver={(e) => { if (draggedUnassignedId && !roomIsFull) e.preventDefault(); }}
                          onDrop={() => draggedUnassignedId && handleAssignUnassignedToRoom(getUnassignedIdsToMove(draggedUnassignedId), roomCapacity)}
                          onClick={() => selectedUnassignedIds.size > 0 && !roomIsFull && handleAssignUnassignedToRoom(Array.from(selectedUnassignedIds), roomCapacity)}
                          className={`bg-blue-50 border-t-2 border-blue-200 transition-colors ${
                            isDropTarget && !roomIsFull ? 'ring-2 ring-inset ring-primary-400 cursor-pointer' : ''
                          } ${isDropTarget && roomIsFull ? 'opacity-60' : ''}`}
                        >
                          <td colSpan={8} className="px-3 py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-blue-900">
                                  Room {roomCapacity.roomNumber}
                                </span>
                                <span className="text-xs text-blue-700">
                                  {roomCapacity.buildingName} • Floor {roomCapacity.floorNumber}
                                </span>
                                {draggedUnassignedId && !roomIsFull && (
                                  <span className="text-xs text-primary-600 font-medium">Drop to assign here</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                  capacityPercent >= 100 ? 'bg-green-100 text-green-800' :
                                  capacityPercent >= 75 ? 'bg-blue-100 text-blue-800' :
                                  capacityPercent >= 50 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-orange-100 text-orange-800'
                                }`}>
                                  {roomCapacity.assignedCount}/{roomCapacity.capacity} assigned
                                  {roomCapacity.existingCount > 0 && (
                                    <span className="font-normal opacity-75"> ({roomCapacity.existingCount} existing + {roomCapacity.newCount} new)</span>
                                  )}
                                </span>
                                {/* Capacity visual bar */}
                                <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${
                                      capacityPercent >= 100 ? 'bg-green-500' :
                                      capacityPercent >= 75 ? 'bg-blue-500' :
                                      capacityPercent >= 50 ? 'bg-yellow-500' :
                                      'bg-orange-500'
                                    }`}
                                    style={{ width: `${Math.min(capacityPercent, 100)}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                        );
                      })()}
                      
                      {/* Assignment Row */}
                      <tr key={`assignment-${idx}`} className={`hover:bg-gray-50 ${
                        isLastInRoom ? 'border-b-2 border-blue-200' : ''
                      }`}>
                        <td className="px-3 py-4 text-sm text-gray-500">{idx + 1}</td>
                        <td className="px-3 py-4 text-sm font-medium">
                          <button
                            onClick={() => handleAttendeeClick(assignment.attendeeId)}
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                          >
                            <User size={14} />
                            {assignment.attendeeName}
                          </button>
                          {(assignment.church || assignment.governorate || assignment.area) && (
                            <p className="text-xs text-gray-500 pl-5 mt-0.5 truncate max-w-[180px]">
                              {[assignment.church, assignment.governorate, assignment.area].filter(Boolean).join(' • ')}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-900">
                          <div className="flex items-center gap-2">
                            <span>{assignment.roomNumber}</span>
                            {sortBy !== 'room' && roomCapacity && (
                              <span className="text-xs text-gray-500 font-medium">
                                ({roomCapacity.assignedCount}/{roomCapacity.capacity})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-600">{assignment.buildingName}</td>
                        <td className="px-3 py-4 text-sm text-gray-600">{assignment.floorNumber}</td>
                    <td className="px-3 py-4 text-sm">
                      {assignment.isExisting ? (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">
                          Already Assigned
                        </span>
                      ) : (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          assignment.score >= 0.8 ? 'bg-green-100 text-green-800' :
                          assignment.score >= 0.6 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-orange-100 text-orange-800'
                        }`}>
                          {(assignment.score * 100).toFixed(0)}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-4 text-sm text-gray-700">
                      <div className="space-y-3">
                        {/* Compact Info Grid */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {/* Gender & Age */}
                          {(assignment.gender || assignment.age) && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-gray-500 font-medium">👤</span>
                              <span className="text-gray-700">
                                {assignment.gender && (
                                  <span className="capitalize">{assignment.gender.toLowerCase()}</span>
                                )}
                                {assignment.gender && assignment.age && ', '}
                                {assignment.age && <span>{assignment.age}y</span>}
                              </span>
                            </div>
                          )}
                          
                          {/* Group Info */}
                          {assignment.groupInfo && assignment.groupInfo.groupType !== 'individual' && (
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${
                                assignment.groupInfo.groupType === 'roommate' ? 'bg-blue-100 text-blue-700' :
                                assignment.groupInfo.groupType === 'family' ? 'bg-purple-100 text-purple-700' :
                                assignment.groupInfo.groupType === 'area' ? 'bg-teal-100 text-teal-700' :
                                assignment.groupInfo.groupType === 'church' ? 'bg-green-100 text-green-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {assignment.groupInfo.groupType === 'roommate' ? '🤝' :
                                 assignment.groupInfo.groupType === 'family' ? '👨‍👩‍👧‍👦' :
                                 assignment.groupInfo.groupType === 'area' ? '📍' :
                                 assignment.groupInfo.groupType === 'church' ? '⛪' : '👥'}
                                <span className="ml-1">
                                  {assignment.groupInfo.groupType.charAt(0).toUpperCase() + assignment.groupInfo.groupType.slice(1)}
                                </span>
                                {assignment.groupInfo.groupSize > 1 && (
                                  <span className="ml-1">
                                    ({assignment.groupInfo.roommatesInSameRoom || 0}/{assignment.groupInfo.groupSize})
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* {Score Factors}
                        {assignment.scoreBreakdown && Object.keys(assignment.scoreBreakdown).length > 0 && (
                          <div>
                            <div className="text-xs text-gray-500 font-medium mb-1.5">Applied Factors:</div>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(assignment.scoreBreakdown)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 5)
                                .map(([rule, score]) => (
                                  <span 
                                    key={rule}
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200"
                                    title={`${rule}: ${(score * 100).toFixed(0)}%`}
                                  >
                                    {rule.replace('Rule', '').replace(/_/g, ' ').toLowerCase()}
                                    <span className="ml-1 font-semibold">+{(score * 100).toFixed(0)}%</span>
                                  </span>
                                ))}
                              {Object.keys(assignment.scoreBreakdown).length > 5 && (
                                <details className="inline-block">
                                  <summary className="cursor-pointer text-xs text-blue-600 hover:text-blue-800 px-2 py-0.5">
                                    +{Object.keys(assignment.scoreBreakdown).length - 5} more
                                  </summary>
                                  <div className="absolute z-10 mt-1 p-2 bg-white border border-gray-200 rounded shadow-lg space-y-1 min-w-48">
                                    {Object.entries(assignment.scoreBreakdown)
                                      .sort((a, b) => b[1] - a[1])
                                      .slice(5)
                                      .map(([rule, score]) => (
                                        <div key={rule} className="flex justify-between items-center text-xs">
                                          <span className="text-gray-600">{rule.replace('Rule', '').replace(/_/g, ' ')}:</span>
                                          <span className="font-medium text-gray-900">+{(score * 100).toFixed(0)}%</span>
                                        </div>
                                      ))}
                                  </div>
                                </details>
                              )}
                            </div>
                          </div>
                        )} */}

                        {/* Rooming Notes — shown for everyone, not just when a match rule referenced them */}
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <div className="text-xs">
                            <span className="text-gray-500 font-medium">
                              📝 {notesView === 'parsed' ? 'Parsed' : 'Notes'}:{' '}
                            </span>
                            {notesView === 'parsed' ? (
                              assignment.parsedRoomingNotes ? (
                                <span className="text-gray-700 whitespace-pre-wrap break-words">{assignment.parsedRoomingNotes}</span>
                              ) : assignment.roomingNotes ? (
                                <span className="text-gray-400 italic">Not parsed yet — showing original: "{assignment.roomingNotes}"</span>
                              ) : (
                                <span className="text-gray-400 italic">No notes</span>
                              )
                            ) : assignment.roomingNotes ? (
                              <span className="text-gray-700 whitespace-pre-wrap break-words">{assignment.roomingNotes}</span>
                            ) : (
                              <span className="text-gray-400 italic">No notes</span>
                            )}
                          </div>
                        </div>
                        
                        {/* Warnings */}
                        {assignment.warnings && assignment.warnings.length > 0 && (
                          <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-yellow-200 bg-yellow-50 -mx-2 px-2 py-1.5 rounded">
                            <span className="text-yellow-600 text-xs">⚠️</span>
                            <span className="text-xs text-yellow-800 font-medium flex-1">
                              {assignment.warnings[0]}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-4 text-sm">
                      <button
                        onClick={() => handleUnassignFromPreview(assignment.attendeeId, assignment.attendeeName)}
                        className="text-gray-500 hover:text-red-600 flex items-center gap-1 transition-colors"
                        title="Unassign from this room (preview only)"
                      >
                        <UserMinus size={14} />
                        Unassign
                      </button>
                    </td>
                  </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Empty Rooms — the list view above is assignment-row-driven, so a
            room with zero occupants has no row to attach a header to; shown
            here instead as its own compact, still-droppable section. */}
        {viewMode === 'list' && emptyRoomsList.length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden mt-4">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">
                Empty Rooms ({emptyRoomsList.length})
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                No one assigned yet — drag onto, or click an unassigned attendee then click, a room below.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
              {emptyRoomsList.map((room) => {
                const isDropTarget = Boolean(draggedUnassignedId || selectedUnassignedIds.size > 0);
                return (
                  <div
                    key={room.roomId}
                    onDragOver={(e) => { if (draggedUnassignedId) e.preventDefault(); }}
                    onDrop={() => draggedUnassignedId && handleAssignUnassignedToRoom(getUnassignedIdsToMove(draggedUnassignedId), room)}
                    onClick={() => selectedUnassignedIds.size > 0 && handleAssignUnassignedToRoom(Array.from(selectedUnassignedIds), room)}
                    className={`border border-dashed border-gray-300 rounded-lg px-3 py-2 transition-all ${
                      isDropTarget ? 'ring-2 ring-primary-400 cursor-pointer border-primary-300' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700">Room {room.roomNumber}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        0/{room.capacity}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {room.buildingName} • Floor {room.floorNumber}
                    </div>
                    {isDropTarget && (
                      <p className="text-xs text-primary-600 font-medium mt-1">Drop to assign here</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        </div>

        {/* Right column: Activity Feed + Unassigned sidebar, stacked
            together as ONE grid child so they share the second column
            instead of each becoming a separate (mis-placed) grid cell. */}
        <div className="flex flex-col gap-6">
        {/* Activity Feed — shared draft, so this shows what OTHER admins
            (as well as this one) have done to it, live via socket updates. */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <button
            onClick={() => setShowActivity((v) => !v)}
            className="w-full px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between text-left"
          >
            <span className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              <Activity size={14} className="text-gray-500" />
              Activity ({activity.length})
            </span>
            {showActivity ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </button>
          {showActivity && (
            <div className="max-h-64 overflow-y-auto p-3 space-y-2">
              {activity.length === 0 ? (
                <div className="text-xs text-gray-500 text-center py-4">No activity yet</div>
              ) : (
                activity.map((entry) => (
                  <div key={entry.id} className="text-xs">
                    <p className="text-gray-700">{entry.details?.summary || entry.action}</p>
                    <p className="text-gray-400 mt-0.5">{new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Sidebar: Unassigned Attendees — drag onto, or click then click, a
            room in the Grid/List view on the left to assign (preview only). */}
        {previewResult.unassignedAttendees && previewResult.unassignedAttendees.length > 0 && (
          <div className="lg:sticky lg:top-40 bg-white rounded-lg shadow overflow-hidden flex flex-col max-h-[calc(100vh-10rem)]">
            <div className="px-4 py-3 border-b border-gray-200 bg-amber-50">
              <h3 className="text-sm font-semibold text-amber-900">
                Unassigned Attendees ({previewResult.unassignedAttendees.length})
              </h3>
              <p className="text-xs text-amber-700 mt-1">
                Drag onto a room, or click one then click a room, in the list/grid on the left. Preview only, until Confirm & Execute.
              </p>
            </div>

            <div className="p-3 border-b border-gray-200">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={unassignedSearchQuery}
                  onChange={(e) => setUnassignedSearchQuery(e.target.value)}
                  placeholder="Search name, rooming notes, area, governorate, church..."
                  className="w-full pl-9 pr-8 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {unassignedSearchQuery && (
                  <button
                    onClick={() => setUnassignedSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 mt-2">
                {(['ALL', 'MALE', 'FEMALE'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setUnassignedGenderFilter(g)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      unassignedGenderFilter === g
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {g === 'ALL' ? 'All' : g === 'MALE' ? 'Male' : 'Female'}
                  </button>
                ))}
              </div>
            </div>

            {filteredUnassignedAttendees.length > 0 && (
              <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between text-xs">
                <button
                  onClick={() =>
                    setSelectedUnassignedIds((prev) => {
                      const allFilteredSelected = filteredUnassignedAttendees.every((u) => prev.has(u.id));
                      if (allFilteredSelected) {
                        // Deselect just the currently-filtered ones, keep any
                        // selection outside the current search/filter intact.
                        const next = new Set(prev);
                        filteredUnassignedAttendees.forEach((u) => next.delete(u.id));
                        return next;
                      }
                      const next = new Set(prev);
                      filteredUnassignedAttendees.forEach((u) => next.add(u.id));
                      return next;
                    })
                  }
                  className="text-primary-600 hover:text-primary-800 font-medium"
                >
                  {filteredUnassignedAttendees.every((u) => selectedUnassignedIds.has(u.id)) ? 'Deselect all' : 'Select all'}
                </button>
                {selectedUnassignedIds.size > 0 && (
                  <span className="text-gray-500">{selectedUnassignedIds.size} selected</span>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-2">
              {filteredUnassignedAttendees.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-500">
                  {unassignedSearchQuery ? 'No matching attendees' : 'Everyone is assigned!'}
                </div>
              ) : (
                filteredUnassignedAttendees.map((u) => {
                  const isSelected = selectedUnassignedIds.has(u.id);
                  return (
                  <div
                    key={u.id}
                    draggable
                    onDragStart={() => setDraggedUnassignedId(u.id)}
                    onDragEnd={() => setDraggedUnassignedId(null)}
                    onClick={() =>
                      setSelectedUnassignedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(u.id)) next.delete(u.id);
                        else next.add(u.id);
                        return next;
                      })
                    }
                    className={`p-3 mb-1 rounded-lg cursor-pointer border-2 transition-all flex items-start gap-2 ${
                      isSelected
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
                    } ${draggedUnassignedId === u.id ? 'opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="mt-1 shrink-0 accent-primary-600"
                    />
                    <div className="flex items-center justify-between gap-2 flex-1 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {u.name}
                          {u.gender && (
                            <span className="ml-1.5 text-xs font-normal text-gray-400">
                              ({u.gender.toLowerCase() === 'male' ? 'M' : u.gender.toLowerCase() === 'female' ? 'F' : u.gender})
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {[u.church, u.governorate, u.area].filter(Boolean).join(' • ') || u.reason}
                        </p>
                        {u.roomingNotes && (
                          <p className="text-xs text-blue-600 mt-0.5 whitespace-pre-wrap break-words">📝 {u.roomingNotes}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        Unassigned
                      </span>
                    </div>
                  </div>
                  );
                })
              )}
            </div>

            {selectedUnassignedIds.size > 0 && (
              <div className="p-3 border-t border-gray-200 bg-primary-50 flex items-center justify-between gap-2">
                <p className="text-xs text-primary-700">
                  💡 {selectedUnassignedIds.size} selected — click (or drag) a room on the left to assign
                </p>
                <button
                  onClick={() => setSelectedUnassignedIds(new Set())}
                  className="shrink-0 text-xs text-primary-600 hover:text-primary-800 underline"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}
        </div>
        </div>
      </div>

      {/* Attendee Details Modal */}
      {showAttendeeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <User size={24} className="text-blue-600" />
                Attendee Details
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="px-6 py-4">
              {isLoadingAttendee ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
                </div>
              ) : selectedAttendee ? (
                <div className="space-y-6">
                  {/* Personal Information */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">Personal Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-600">Full Name</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.fullName}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Ticket ID</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.ticketId || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Age</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.age || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Gender</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.gender || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Phone</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.phone || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Email</label>
                        <p className="text-base text-gray-900 mt-1 break-all">{selectedAttendee.email || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Church & Location */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">Church & Location</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-600">Church</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.church || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Governorate</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.governorate || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Area</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.area || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Is Servant</label>
                        <p className="text-base text-gray-900 mt-1">
                          {selectedAttendee.isServant ? (
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">Yes</span>
                          ) : (
                            <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">No</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Conference Details */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">Conference Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-600">Role</label>
                        <p className="text-base text-gray-900 mt-1">
                          <span className={`px-2 py-1 rounded text-sm font-medium ${
                            selectedAttendee.conferenceRole === 'VIP' ? 'bg-purple-100 text-purple-800' :
                            selectedAttendee.conferenceRole === 'LEADER' ? 'bg-blue-100 text-blue-800' :
                            selectedAttendee.conferenceRole === 'PASTOR' ? 'bg-indigo-100 text-indigo-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {selectedAttendee.conferenceRole}
                          </span>
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Arrival Method</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.arrivalMethod || 'N/A'}</p>
                      </div>
                      {selectedAttendee.busPickupPoint && (
                        <div className="col-span-2">
                          <label className="text-sm font-medium text-gray-600">Bus Pickup Point</label>
                          <p className="text-base text-gray-900 mt-1">{selectedAttendee.busPickupPoint}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Payment Information */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">Payment Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-600">Payment Method</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.paymentMethod || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Payment Status</label>
                        <p className="text-base text-gray-900 mt-1">
                          <span className={`px-2 py-1 rounded text-sm font-medium ${
                            selectedAttendee.paymentStatus === 'CONFIRMED' ? 'bg-green-100 text-green-800' :
                            selectedAttendee.paymentStatus === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                            selectedAttendee.paymentStatus === 'REJECTED' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {selectedAttendee.paymentStatus || 'N/A'}
                          </span>
                        </p>
                      </div>
                      {selectedAttendee.transactionNumber && (
                        <div className="col-span-2">
                          <label className="text-sm font-medium text-gray-600">Transaction Number</label>
                          <p className="text-base text-gray-900 mt-1 font-mono">{selectedAttendee.transactionNumber}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  {(selectedAttendee.roomingNotes || selectedAttendee.notes || selectedAttendee.internalNotes) && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">Notes</h3>
                      <div className="space-y-3">
                        {selectedAttendee.roomingNotes && (
                          <div>
                            <label className="text-sm font-medium text-blue-600">Rooming Notes</label>
                            <p className="text-sm text-gray-900 mt-1 bg-blue-50 p-3 rounded">{selectedAttendee.roomingNotes}</p>
                          </div>
                        )}
                        {selectedAttendee.notes && (
                          <div>
                            <label className="text-sm font-medium text-gray-600">General Notes</label>
                            <p className="text-sm text-gray-900 mt-1 bg-gray-50 p-3 rounded">{selectedAttendee.notes}</p>
                          </div>
                        )}
                        {selectedAttendee.internalNotes && (
                          <div>
                            <label className="text-sm font-medium text-orange-600">Internal Notes</label>
                            <p className="text-sm text-gray-900 mt-1 bg-orange-50 p-3 rounded">{selectedAttendee.internalNotes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Check-in Status */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">Check-in Status</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-600">Checked In</label>
                        <p className="text-base text-gray-900 mt-1">
                          {selectedAttendee.checkedInAt ? (
                            <>
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">Yes</span>
                              <span className="text-xs text-gray-600 ml-2">
                                {new Date(selectedAttendee.checkedInAt).toLocaleString()}
                              </span>
                            </>
                          ) : (
                            <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">Not checked in</span>
                          )}
                        </p>
                      </div>
                      {selectedAttendee.checkedOutAt && (
                        <div>
                          <label className="text-sm font-medium text-gray-600">Checked Out</label>
                          <p className="text-base text-gray-900 mt-1">
                            <span className="text-xs text-gray-600">
                              {new Date(selectedAttendee.checkedOutAt).toLocaleString()}
                            </span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-600">No attendee data available</div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Swap Attendees Modal */}
      {showSwapModal && previewResult?.assignments && (
        <SwapAttendeesModal
          isOpen={showSwapModal}
          onClose={() => setShowSwapModal(false)}
          onSwapComplete={handleSwapComplete}
          customSwapHandler={handlePreviewSwap}
          useLocalSearch={true}
          emptyRooms={emptyRoomsList.map((room) => ({
            roomId: room.roomId,
            roomNumber: room.roomNumber,
            buildingName: room.buildingName,
            floorNumber: room.floorNumber,
            capacity: room.capacity,
          }))}
          attendees={previewResult.assignments.map((assignment) => {
            const roomCapacity = roomCapacityMap.get(assignment.roomId)?.capacity || 0;
            
            return {
              id: assignment.attendeeId,
              fullName: assignment.attendeeName,
              gender: assignment.gender as any,
              age: assignment.age,
              conferenceRole: 'ATTENDEE' as const,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              assignment: {
                id: assignment.attendeeId,
                attendeeId: assignment.attendeeId,
                roomId: assignment.roomId,
                assignedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                room: {
                  id: assignment.roomId,
                  roomNumber: assignment.roomNumber,
                  capacity: roomCapacity,
                  roomType: 'GENERAL' as const,
                  floorId: '',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  floor: {
                    id: '',
                    floorNumber: assignment.floorNumber,
                    buildingId: '',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    building: {
                      id: '',
                      name: assignment.buildingName,
                      conferenceHouseId: '',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                  },
                },
              },
            } as Attendee;
          })}
        />
      )}
    </div>
  );
}
