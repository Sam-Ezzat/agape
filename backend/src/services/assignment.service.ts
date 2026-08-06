/**
 * Room Assignment Service
 *
 * WHY: Business logic for room-attendee assignments
 * Handles capacity validation, conflict prevention, and batch operations
 */

import { RoomAssignment } from '@prisma/client';
import { RoomAssignmentRepository } from '@/repositories/RoomAssignmentRepository';
import { AttendeeRepository } from '@/repositories/AttendeeRepository';
import { RoomRepository } from '@/repositories/RoomRepository';
import { AuditLogRepository } from '@/repositories/AuditLogRepository';
import {
  CreateAssignmentDTO,
  UpdateAssignmentDTO,
  BatchAssignmentDTO,
  AssignmentFilterParams,
} from '@/validators/assignment.schemas';
import { AppError } from '@/middleware/errorHandler';
import { getNotificationService } from './notification.service';
import { NotificationEvent, NotificationType } from '@/types/notifications';

export class AssignmentService {
  constructor(
    private assignmentRepository: RoomAssignmentRepository,
    private attendeeRepository: AttendeeRepository,
    private roomRepository: RoomRepository,
    private auditLogRepository: AuditLogRepository
  ) {}

  /**
   * Create room assignment
   * WHY: Assign attendee to a room with validation
   */
  async create(data: CreateAssignmentDTO, organizationId: string, userId?: string): Promise<RoomAssignment> {
    // Validate attendee exists and is not deleted
    const attendee = await this.attendeeRepository.findByIdScoped(data.attendeeId, organizationId);
    if (!attendee || attendee.deletedAt) {
      throw new AppError(404, 'Attendee not found');
    }

    // Check if attendee is already assigned
    const existingAssignment = await this.assignmentRepository.findByAttendeeId(data.attendeeId, organizationId);
    if (existingAssignment) {
      throw new AppError(
        409,
        'Attendee is already assigned to a room. Please unassign first.'
      );
    }

    // Validate room exists
    const room = await this.roomRepository.findByIdScoped(data.roomId, organizationId);
    if (!room) {
      throw new AppError(404, 'Room not found');
    }

    // Business rule: Check room capacity
    const currentOccupancy = await this.assignmentRepository.countByRoomId(data.roomId, organizationId);
    if (currentOccupancy >= room.capacity) {
      throw new AppError(
        409,
        `Room ${room.roomNumber} is at full capacity (${room.capacity}/${room.capacity})`
      );
    }

    // Create assignment
    // WHY: RoomAssignment has no direct organizationId column; tenancy is
    // enforced by verifying attendee & room ownership above before create.
    const assignment = await this.assignmentRepository.create(data);

    // Get full details for audit log
    const fullAssignment = await this.assignmentRepository.findByIdWithDetails(assignment.id, organizationId);

    // Create audit log
    await this.auditLogRepository.createLog({
      action: 'assign',
      entityType: 'room_assignment',
      entityId: assignment.id,
      details: {
        attendeeName: attendee.fullName,
        attendeeId: attendee.id,
        roomId: room.id,
        roomNumber: room.roomNumber,
        building: fullAssignment?.room.floor.building.name,
      },
      organizationId,
      userId,
    });

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        organizationId,
        NotificationEvent.ROOM_ASSIGNED,
        NotificationType.SUCCESS,
        `${attendee.fullName} assigned to room ${room.roomNumber}`,
        'Room Assigned'
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }

    return assignment;
  }

  /**
   * Get assignment by ID
   * WHY: View single assignment details
   */
  async getById(id: string, organizationId: string) {
    const assignment = await this.assignmentRepository.findByIdWithDetails(id, organizationId);
    if (!assignment) {
      throw new AppError(404, 'Assignment not found');
    }
    return assignment;
  }

  /**
   * List assignments with filters
   * WHY: Browse assignments by room/building/floor
   */
  async list(params: AssignmentFilterParams, organizationId: string) {
    return this.assignmentRepository.search(params, organizationId);
  }

  /**
   * Update assignment (move to different room)
   * WHY: Change room assignment
   */
  async update(id: string, data: UpdateAssignmentDTO, organizationId: string, userId?: string): Promise<RoomAssignment> {
    const existing = await this.assignmentRepository.findByIdWithDetails(id, organizationId);
    if (!existing) {
      throw new AppError(404, 'Assignment not found');
    }

    // If changing room, validate new room capacity
    if (data.roomId && data.roomId !== existing.roomId) {
      const newRoom = await this.roomRepository.findByIdScoped(data.roomId, organizationId);
      if (!newRoom) {
        throw new AppError(404, 'New room not found');
      }

      const newRoomOccupancy = await this.assignmentRepository.countByRoomId(data.roomId, organizationId);
      if (newRoomOccupancy >= newRoom.capacity) {
        throw new AppError(
          409,
          `Room ${newRoom.roomNumber} is at full capacity (${newRoom.capacity}/${newRoom.capacity})`
        );
      }
    }

    const updated = await this.assignmentRepository.update(id, data);
    const fullAssignment = await this.assignmentRepository.findByIdWithDetails(id, organizationId);

    // Create audit log
    await this.auditLogRepository.createLog({
      action: 'update_assignment',
      entityType: 'room_assignment',
      entityId: id,
      details: {
        changes: data,
        attendeeName: fullAssignment?.attendee.fullName,
      },
      organizationId,
      userId,
    });

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        organizationId,
        NotificationEvent.ROOM_ASSIGNED,
        NotificationType.INFO,
        `Assignment updated for ${fullAssignment?.attendee.fullName}`,
        'Assignment Updated'
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }

    return updated;
  }

  /**
   * Delete assignment (unassign attendee)
   * WHY: Remove attendee from room
   */
  async delete(id: string, organizationId: string, userId?: string): Promise<void> {
    const assignment = await this.assignmentRepository.findByIdWithDetails(id, organizationId);
    if (!assignment) {
      throw new AppError(404, 'Assignment not found');
    }

    await this.assignmentRepository.deleteScoped(id, organizationId);

    // Create audit log
    await this.auditLogRepository.createLog({
      action: 'unassign',
      entityType: 'room_assignment',
      entityId: id,
      details: {
        attendeeName: assignment.attendee.fullName,
        roomNumber: assignment.room.roomNumber,
        building: assignment.room.floor.building.name,
      },
      organizationId,
      userId,
    });

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        organizationId,
        NotificationEvent.ROOM_UNASSIGNED,
        NotificationType.WARNING,
        `${assignment.attendee.fullName} unassigned from room ${assignment.room.roomNumber}`,
        'Room Unassigned'
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  /**
   * Batch assign attendees to rooms
   * WHY: Efficient bulk assignment
   */
  async batchAssign(data: BatchAssignmentDTO, organizationId: string, userId?: string) {
    const results = {
      successful: [] as RoomAssignment[],
      failed: [] as { assignment: any; error: string }[],
    };

    // Validate all before creating any
    const validations = await Promise.all(
      data.assignments.map(async (assignment) => {
        try {
          // Check attendee
          const attendee = await this.attendeeRepository.findByIdScoped(assignment.attendeeId, organizationId);
          if (!attendee || attendee.deletedAt) {
            return { valid: false, error: `Attendee not found: ${assignment.attendeeId}` };
          }

          // Check existing assignment
          const existing = await this.assignmentRepository.findByAttendeeId(assignment.attendeeId, organizationId);
          if (existing) {
            return { valid: false, error: `Attendee ${attendee.fullName} already assigned` };
          }

          // Check room capacity
          const room = await this.roomRepository.findByIdScoped(assignment.roomId, organizationId);
          if (!room) {
            return { valid: false, error: `Room not found: ${assignment.roomId}` };
          }

          const occupancy = await this.assignmentRepository.countByRoomId(assignment.roomId, organizationId);
          if (occupancy >= room.capacity) {
            return { valid: false, error: `Room ${room.roomNumber} is full` };
          }

          return { valid: true, attendee, room };
        } catch (error) {
          return { valid: false, error: (error as Error).message };
        }
      })
    );

    // Process assignments
    for (let i = 0; i < data.assignments.length; i++) {
      const validation = validations[i];
      const assignmentData = data.assignments[i];

      if (!validation.valid) {
        results.failed.push({
          assignment: assignmentData,
          error: validation.error || 'Validation failed',
        });
        continue;
      }

      try {
        const created = await this.assignmentRepository.create(assignmentData);
        results.successful.push(created);

        // Create audit log for each successful assignment
        await this.auditLogRepository.createLog({
          action: 'batch_assign',
          entityType: 'room_assignment',
          entityId: created.id,
          details: {
            attendeeId: assignmentData.attendeeId,
            roomId: assignmentData.roomId,
          },
          organizationId,
          userId,
        });
      } catch (error) {
        results.failed.push({
          assignment: assignmentData,
          error: (error as Error).message,
        });
      }
    }

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        organizationId,
        NotificationEvent.ROOM_ASSIGNED,
        NotificationType.SUCCESS,
        `Batch assignment: ${results.successful.length} successful, ${results.failed.length} failed`,
        'Batch Assignment Complete'
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }

    return results;
  }

  /**
   * Get room availability
   * WHY: Show available rooms for assignment UI
   */
  async getAvailability(organizationId: string) {
    return this.assignmentRepository.getRoomAvailability(organizationId);
  }

  /**
   * Get assignments by room
   * WHY: Show who's in a room
   */
  async getByRoomId(roomId: string, organizationId: string) {
    return this.assignmentRepository.findByRoomId(roomId, organizationId);
  }
}
