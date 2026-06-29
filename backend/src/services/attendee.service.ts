/**
 * Attendee Service
 * 
 * WHY: Business logic layer for attendee operations
 * Handles validation, lifecycle management, and notification broadcasting
 */

import { Attendee } from '@prisma/client';
import { AttendeeRepository } from '@/repositories/AttendeeRepository';
import { RoomAssignmentRepository } from '@/repositories/RoomAssignmentRepository';
import { AuditLogRepository } from '@/repositories/AuditLogRepository';
import { CreateAttendeeDTO, UpdateAttendeeDTO, AttendeeFilterParams } from '@/validators/attendee.schemas';
import { AppError } from '@/middleware/errorHandler';
import { getNotificationService } from './notification.service';
import { NotificationEvent, NotificationType } from '@/types/notifications';

export class AttendeeService {
  constructor(
    private attendeeRepository: AttendeeRepository,
    private assignmentRepository: RoomAssignmentRepository,
    private auditLogRepository: AuditLogRepository
  ) {}

  /**
   * Create new attendee
   * WHY: Register person for conference
   */
  async create(data: CreateAttendeeDTO): Promise<Attendee> {
    const attendee = await this.attendeeRepository.create(data);

    // Create audit log
    await this.auditLogRepository.createLog({
      action: 'create',
      entityType: 'attendee',
      entityId: attendee.id,
      details: { fullName: attendee.fullName, role: attendee.conferenceRole },
    });

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        NotificationEvent.ATTENDEE_CREATED,
        NotificationType.SUCCESS,
        `Attendee "${attendee.fullName}" registered`,
        'Attendee Registered',
        { attendeeId: attendee.id, fullName: attendee.fullName }
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }

    return attendee;
  }

  /**
   * Get attendee by ID
   * WHY: View single attendee details
   */
  async getById(id: string): Promise<Attendee> {
    const attendee = await this.attendeeRepository.findById(id);
    if (!attendee || attendee.deletedAt) {
      throw new AppError(404, 'Attendee not found');
    }
    return attendee;
  }

  /**
   * Get attendee with full details (assignment + room)
   * WHY: Show complete attendee profile
   */
  async getWithDetails(id: string) {
    const attendee = await this.attendeeRepository.findByIdWithDetails(id);
    if (!attendee || attendee.deletedAt) {
      throw new AppError(404, 'Attendee not found');
    }
    return attendee;
  }

  /**
   * List attendees with filters and pagination
   * WHY: Browse/search attendees
   */
  async list(params: AttendeeFilterParams) {
    return this.attendeeRepository.search(params);
  }

  /**
   * Update attendee
   * WHY: Edit attendee information
   */
  async update(id: string, data: UpdateAttendeeDTO): Promise<Attendee> {
    const existing = await this.attendeeRepository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new AppError(404, 'Attendee not found');
    }

    const updated = await this.attendeeRepository.update(id, data);

    // Create audit log
    await this.auditLogRepository.createLog({
      action: 'update',
      entityType: 'attendee',
      entityId: id,
      details: { changes: data },
    });

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        NotificationEvent.ATTENDEE_UPDATED,
        NotificationType.INFO,
        `Attendee "${updated.fullName}" updated`,
        'Attendee Updated',
        { attendeeId: id, fullName: updated.fullName }
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }

    return updated;
  }

  /**
   * Delete attendee (soft delete)
   * WHY: Remove attendee while preserving audit trail
   */
  async delete(id: string): Promise<void> {
    const attendee = await this.attendeeRepository.findById(id);
    if (!attendee || attendee.deletedAt) {
      throw new AppError(404, 'Attendee not found');
    }

    // Business rule: Cannot delete attendee with active room assignment
    const assignment = await this.assignmentRepository.findByAttendeeId(id);
    if (assignment) {
      throw new AppError(
        409,
        'Cannot delete attendee with active room assignment. Please unassign first.'
      );
    }

    await this.attendeeRepository.softDelete(id);

    // Create audit log
    await this.auditLogRepository.createLog({
      action: 'delete',
      entityType: 'attendee',
      entityId: id,
      details: { fullName: attendee.fullName },
    });

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        NotificationEvent.ATTENDEE_DELETED,
        NotificationType.WARNING,
        `Attendee "${attendee.fullName}" deleted`,
        'Attendee Deleted',
        { attendeeId: id, fullName: attendee.fullName }
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  /**
   * Check in attendee
   * WHY: Mark attendee as present at conference
   */
  async checkIn(id: string): Promise<Attendee> {
    const attendee = await this.attendeeRepository.findById(id);
    if (!attendee || attendee.deletedAt) {
      throw new AppError(404, 'Attendee not found');
    }

    // Business rule: Cannot check in if already checked in
    if (attendee.checkedInAt && !attendee.checkedOutAt) {
      throw new AppError(409, 'Attendee is already checked in');
    }

    // Optional: Require room assignment before check-in
    // const assignment = await this.assignmentRepository.findByAttendeeId(id);
    // if (!assignment) {
    //   throw new AppError(409, 'Attendee must be assigned to a room before check-in');
    // }

    const checkedIn = await this.attendeeRepository.checkIn(id);

    // Create audit log
    await this.auditLogRepository.createLog({
      action: 'check_in',
      entityType: 'attendee',
      entityId: id,
      details: { fullName: checkedIn.fullName, timestamp: checkedIn.checkedInAt },
    });

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        NotificationEvent.ATTENDEE_CHECKED_IN,
        NotificationType.SUCCESS,
        `${checkedIn.fullName} checked in`,
        'Check-In Complete',
        { attendeeId: id, fullName: checkedIn.fullName }
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }

    return checkedIn;
  }

  /**
   * Check out attendee
   * WHY: Mark attendee as departed from conference
   */
  async checkOut(id: string): Promise<Attendee> {
    const attendee = await this.attendeeRepository.findById(id);
    if (!attendee || attendee.deletedAt) {
      throw new AppError(404, 'Attendee not found');
    }

    // Business rule: Must be checked in to check out
    if (!attendee.checkedInAt) {
      throw new AppError(409, 'Attendee is not checked in');
    }

    if (attendee.checkedOutAt) {
      throw new AppError(409, 'Attendee is already checked out');
    }

    const checkedOut = await this.attendeeRepository.checkOut(id);

    // Optional: Auto-unassign from room on checkout
    const assignment = await this.assignmentRepository.findByAttendeeId(id);
    if (assignment) {
      await this.assignmentRepository.delete(assignment.id);
      await this.auditLogRepository.createLog({
        action: 'unassign',
        entityType: 'room_assignment',
        entityId: assignment.id,
        details: { reason: 'auto_unassign_on_checkout' },
      });
    }

    // Create audit log
    await this.auditLogRepository.createLog({
      action: 'check_out',
      entityType: 'attendee',
      entityId: id,
      details: { fullName: checkedOut.fullName, timestamp: checkedOut.checkedOutAt },
    });

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        NotificationEvent.ATTENDEE_CHECKED_OUT,
        NotificationType.INFO,
        `${checkedOut.fullName} checked out`,
        'Check-Out Complete',
        { attendeeId: id, fullName: checkedOut.fullName }
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }

    return checkedOut;
  }

  /**
   * Get attendee statistics
   * WHY: Dashboard metrics
   */
  async getStatistics() {
    return this.attendeeRepository.getStatistics();
  }

  /**
   * Get unassigned attendees
   * WHY: Show people who need room assignments
   */
  async getUnassigned() {
    return this.attendeeRepository.findUnassigned();
  }
}
