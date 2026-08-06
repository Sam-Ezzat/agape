/**
 * Swap Validation Service
 * 
 * WHY: Validates room assignment swaps between attendees
 * Ensures swaps don't violate gender, capacity, or room type constraints
 * 
 * SOLID: Single Responsibility - Only handles swap validation logic
 */

import { Attendee, Room, Gender, RoomType } from '@prisma/client';
import { RoomRepository } from '@/repositories/RoomRepository';
import { AttendeeRepository } from '@/repositories/AttendeeRepository';
import { RoomAssignmentRepository } from '@/repositories/RoomAssignmentRepository';
import logger from '@/utils/logger';

export interface SwapRequest {
  groupA: string[]; // Array of attendee IDs from group A
  groupB: string[]; // Array of attendee IDs from group B
}

export interface SwapValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  affectedRooms: {
    roomId: string;
    roomNumber: string;
    beforeCapacity: number;
    afterCapacity: number;
  }[];
}

interface RoomWithDetails extends Room {
  floor: {
    floorNumber: number;
    building: {
      id: string;
      name: string;
    };
  };
  currentAssignments: {
    attendee: Attendee;
  }[];
}

export class SwapValidationService {
  constructor(
    private roomRepository: RoomRepository,
    private attendeeRepository: AttendeeRepository,
    private assignmentRepository: RoomAssignmentRepository
  ) {}

  /**
   * Validate if a swap between two groups of attendees is allowed
   */
  async validateSwap(request: SwapRequest, organizationId: string): Promise<SwapValidationResult> {
    const result: SwapValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      affectedRooms: [],
    };

    // Step 1: Load attendees
    const groupAAttendees = await this.loadAttendees(request.groupA, organizationId);
    const groupBAttendees = await this.loadAttendees(request.groupB, organizationId);

    if (groupAAttendees.length !== request.groupA.length) {
      result.valid = false;
      result.errors.push('Some attendees in Group A not found');
      return result;
    }

    if (groupBAttendees.length !== request.groupB.length) {
      result.valid = false;
      result.errors.push('Some attendees in Group B not found');
      return result;
    }

    // Step 2: Get current room assignments
    const groupARooms = await this.getRoomAssignments(request.groupA, organizationId);
    const groupBRooms = await this.getRoomAssignments(request.groupB, organizationId);

    if (groupARooms.length === 0) {
      result.valid = false;
      result.errors.push('Group A has attendees without room assignments');
      return result;
    }

    if (groupBRooms.length === 0) {
      result.valid = false;
      result.errors.push('Group B has attendees without room assignments');
      return result;
    }

    // Step 3: Load full room details
    const uniqueRoomIds = new Set([
      ...groupARooms.map(r => r.roomId),
      ...groupBRooms.map(r => r.roomId),
    ]);

    const rooms = await this.loadRoomsWithDetails(Array.from(uniqueRoomIds), organizationId);
    const roomMap = new Map(rooms.map(r => [r.id, r]));

    // Step 4: Validate each swap direction
    // Group A attendees will move to Group B's room(s)
    // Group B attendees will move to Group A's room(s)

    // Validate Group A → Group B's rooms
    for (const groupBAssignment of groupBRooms) {
      const targetRoom = roomMap.get(groupBAssignment.roomId);
      if (!targetRoom) continue;

      const validation = this.validateGroupToRoom(
        groupAAttendees,
        targetRoom,
        groupBAssignment.attendeeId // Attendee being removed
      );

      result.errors.push(...validation.errors);
      result.warnings.push(...validation.warnings);

      if (validation.errors.length > 0) {
        result.valid = false;
      }
    }

    // Validate Group B → Group A's rooms
    for (const groupAAssignment of groupARooms) {
      const targetRoom = roomMap.get(groupAAssignment.roomId);
      if (!targetRoom) continue;

      const validation = this.validateGroupToRoom(
        groupBAttendees,
        targetRoom,
        groupAAssignment.attendeeId // Attendee being removed
      );

      result.errors.push(...validation.errors);
      result.warnings.push(...validation.warnings);

      if (validation.errors.length > 0) {
        result.valid = false;
      }
    }

    // Step 5: Calculate capacity impact
    for (const roomId of uniqueRoomIds) {
      const room = roomMap.get(roomId);
      if (!room) continue;

      const currentOccupancy = room.currentAssignments.length;
      
      // Calculate how many leaving and entering
      const leavingCount = [...request.groupA, ...request.groupB].filter(
        id => room.currentAssignments.some(a => a.attendee.id === id)
      ).length;
      
      const enteringFromA = groupARooms.some(r => r.roomId === roomId) ? request.groupB.length : 0;
      const enteringFromB = groupBRooms.some(r => r.roomId === roomId) ? request.groupA.length : 0;
      const enteringCount = enteringFromA + enteringFromB;

      const afterOccupancy = currentOccupancy - leavingCount + enteringCount;

      result.affectedRooms.push({
        roomId: room.id,
        roomNumber: room.roomNumber,
        beforeCapacity: currentOccupancy,
        afterCapacity: afterOccupancy,
      });
    }

    return result;
  }

  /**
   * Validate if a group of attendees can be moved to a specific room
   * 
   * VALIDATION POLICY:
   * - Gender violations: BLOCK swap (add to errors)
   * - Rooming notes violations: ALLOW swap with warning (add to warnings)
   * - Capacity violations: BLOCK swap (add to errors)
   */
  private validateGroupToRoom(
    attendees: Attendee[],
    targetRoom: RoomWithDetails,
    removingAttendeeId: string
  ): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Calculate space after removing one attendee
    const currentOccupants = targetRoom.currentAssignments
      .map(a => a.attendee)
      .filter(a => a.id !== removingAttendeeId);
    
    const afterSwapOccupancy = currentOccupants.length + attendees.length;

    // 1. Check capacity (CRITICAL - BLOCKS swap)
    if (afterSwapOccupancy > targetRoom.capacity) {
      errors.push(
        `Room ${targetRoom.roomNumber} would exceed capacity (${afterSwapOccupancy}/${targetRoom.capacity})`
      );
    }

    // 2. Check gender compatibility (CRITICAL - BLOCKS swap)
    // Only for non-FAMILY rooms - strict gender segregation required
    if (targetRoom.roomType !== 'FAMILY') {
      const roomGenders = new Set<Gender>();
      
      // Add existing occupants' genders (after removal)
      currentOccupants.forEach(a => {
        if (a.gender) roomGenders.add(a.gender);
      });
      
      // Add new attendees' genders
      attendees.forEach(a => {
        if (a.gender) roomGenders.add(a.gender);
      });

      if (roomGenders.size > 1) {
        errors.push(
          `Room ${targetRoom.roomNumber} would violate gender segregation after swap (${Array.from(roomGenders).join(', ')}). Gender mixing is not allowed.`
        );
      }
    }

    // 3. Check rooming notes compatibility (WARNING ONLY - ALLOWS swap)
    // Rooming notes violations are allowed but warned about
    const hasRoomingNotes = attendees.some(a => a.roomingNotes && a.roomingNotes.trim().length > 0);
    if (hasRoomingNotes) {
      const attendeesWithNotes = attendees.filter(a => a.roomingNotes && a.roomingNotes.trim().length > 0);
      const notesList = attendeesWithNotes.map(a => `${a.fullName}: "${a.roomingNotes}"`).join('; ');
      
      warnings.push(
        `Attendees with rooming notes are being swapped to room ${targetRoom.roomNumber}. Please verify: ${notesList}`
      );
    }

    // 4. Check room type compatibility (WARNING ONLY - ALLOWS swap)
    const requiresVIP = attendees.some(a => a.conferenceRole === 'VIP' || a.isServant);
    const requiresFamily = attendees.some(a => 
      a.roomingNotes?.toLowerCase().includes('family') ||
      a.notes?.toLowerCase().includes('family')
    );

    if (requiresVIP && targetRoom.roomType === 'GENERAL') {
      warnings.push(
        `VIP or servant attendees are being assigned to general room ${targetRoom.roomNumber}`
      );
    }

    if (requiresFamily && targetRoom.roomType !== 'FAMILY') {
      warnings.push(
        `Attendees with family notes are being assigned to non-family room ${targetRoom.roomNumber}`
      );
    }

    return { errors, warnings };
  }

  /**
   * Load attendees by IDs
   */
  private async loadAttendees(ids: string[], organizationId: string): Promise<Attendee[]> {
    const attendees: Attendee[] = [];
    for (const id of ids) {
      const attendee = await this.attendeeRepository.findByIdScoped(id, organizationId);
      if (attendee) attendees.push(attendee);
    }
    return attendees;
  }

  /**
   * Get room assignments for attendees
   */
  private async getRoomAssignments(attendeeIds: string[], organizationId: string) {
    const assignments = [];
    for (const attendeeId of attendeeIds) {
      const assignment = await this.assignmentRepository.findByAttendeeId(attendeeId, organizationId);
      if (assignment) assignments.push(assignment);
    }
    return assignments;
  }

  /**
   * Load rooms with full details including current occupants
   */
  private async loadRoomsWithDetails(roomIds: string[], organizationId: string): Promise<RoomWithDetails[]> {
    const rooms: RoomWithDetails[] = [];
    for (const roomId of roomIds) {
      const room = await this.roomRepository.findByIdWithAssignment(roomId, organizationId);
      if (room) {
        rooms.push(room as RoomWithDetails);
      }
    }
    return rooms;
  }

  /**
   * Execute the swap (update assignments in database)
   */
  async executeSwap(request: SwapRequest, organizationId: string): Promise<void> {
    logger.info('Executing swap', { request });

    // Step 1: Get current assignments
    const groupAAssignments = await this.getRoomAssignments(request.groupA, organizationId);
    const groupBAssignments = await this.getRoomAssignments(request.groupB, organizationId);

    // Step 2: Delete existing assignments
    for (const assignment of [...groupAAssignments, ...groupBAssignments]) {
      await this.assignmentRepository.deleteScoped(assignment.id, organizationId);
    }

    // Step 3: Create new assignments (swap)
    // Group A → Group B's rooms
    for (const attendeeId of request.groupA) {
      const targetAssignment = groupBAssignments.find(a => a.attendeeId === request.groupB[0]);
      if (targetAssignment) {
        await this.assignmentRepository.create({
          attendeeId,
          roomId: targetAssignment.roomId,
          assignedBy: 'manual-swap',
        });
      }
    }

    // Group B → Group A's rooms
    for (const attendeeId of request.groupB) {
      const targetAssignment = groupAAssignments.find(a => a.attendeeId === request.groupA[0]);
      if (targetAssignment) {
        await this.assignmentRepository.create({
          attendeeId,
          roomId: targetAssignment.roomId,
          assignedBy: 'manual-swap',
        });
      }
    }

    logger.info('Swap executed successfully');
  }
}
