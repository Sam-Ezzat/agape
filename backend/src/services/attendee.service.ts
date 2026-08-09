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
import { CreateAttendeeDTO, UpdateAttendeeDTO, AttendeeFilterParams, UnassignedFilterParams } from '@/validators/attendee.schemas';
import { AppError } from '@/middleware/errorHandler';
import { getNotificationService } from './notification.service';
import { NotificationEvent, NotificationType } from '@/types/notifications';
import { RoomingNotesCacheService } from './auto-assignment/RoomingNotesCacheService';

export class AttendeeService {
  private roomingNotesCacheService: RoomingNotesCacheService;

  constructor(
    private attendeeRepository: AttendeeRepository,
    private assignmentRepository: RoomAssignmentRepository,
    private auditLogRepository: AuditLogRepository
  ) {
    this.roomingNotesCacheService = new RoomingNotesCacheService(attendeeRepository);
  }

  /**
   * Create new attendee
   * WHY: Register person for conference
   */
  async create(
    data: CreateAttendeeDTO,
    organizationId: string,
    userId?: string,
    notify: boolean = true
  ): Promise<Attendee> {
    const attendee = await this.attendeeRepository.create({ ...data, organizationId });

    // WHY: Classify rooming notes now instead of leaving it to be re-classified
    // on every future auto-assignment run, then expand any requested-roommate
    // cluster this attendee connects to so every member's cache reflects the
    // full group.
    this.roomingNotesCacheService.classifyAndExpandInBackground([attendee]);

    // Create audit log
    await this.auditLogRepository.createLog({
      action: 'create',
      entityType: 'attendee',
      entityId: attendee.id,
      details: { fullName: attendee.fullName, role: attendee.conferenceRole },
      organizationId,
      userId,
    });

    // Notify clients
    // WHY: Excel import creates attendees in a loop and passes notify=false —
    // one toast per imported row would flood the UI, so the controller sends
    // a single consolidated "Imported N attendees" notification instead.
    if (notify) {
      try {
        const notificationService = getNotificationService();
        notificationService.broadcast(
          organizationId,
          NotificationEvent.ATTENDEE_CREATED,
          NotificationType.SUCCESS,
          `Attendee "${attendee.fullName}" registered`,
          'Attendee Registered',
          { attendeeId: attendee.id, fullName: attendee.fullName }
        );
      } catch (error) {
        console.error('Failed to send notification:', error);
      }
    }

    return attendee;
  }

  /**
   * Get attendee by ID
   * WHY: View single attendee details
   */
  async getById(id: string, organizationId: string): Promise<Attendee> {
    const attendee = await this.attendeeRepository.findByIdScoped(id, organizationId);
    if (!attendee || attendee.deletedAt) {
      throw new AppError(404, 'Attendee not found');
    }
    return attendee;
  }

  /**
   * Get attendee with full details (assignment + room)
   * WHY: Show complete attendee profile
   */
  async getWithDetails(id: string, organizationId: string) {
    const attendee = await this.attendeeRepository.findByIdWithDetails(id, organizationId);
    if (!attendee || attendee.deletedAt) {
      throw new AppError(404, 'Attendee not found');
    }
    return attendee;
  }

  /**
   * List attendees with filters and pagination
   * WHY: Browse/search attendees
   */
  async list(params: AttendeeFilterParams, organizationId: string) {
    return this.attendeeRepository.search(params, organizationId);
  }

  /**
   * Update attendee
   * WHY: Edit attendee information
   */
  async update(id: string, data: UpdateAttendeeDTO, organizationId: string, userId?: string): Promise<Attendee> {
    const existing = await this.attendeeRepository.findByIdScoped(id, organizationId);
    if (!existing || existing.deletedAt) {
      throw new AppError(404, 'Attendee not found');
    }

    const updated = await this.attendeeRepository.updateScoped(id, organizationId, data);

    // WHY: Re-classify only if roomingNotes actually changed (no-ops when
    // fresh), then re-expand clusters — an edit here can join/split a chain.
    this.roomingNotesCacheService.classifyAndExpandInBackground([updated]);

    // Create audit log
    await this.auditLogRepository.createLog({
      action: 'update',
      entityType: 'attendee',
      entityId: id,
      details: { changes: data },
      organizationId,
      userId,
    });

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        organizationId,
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
  async delete(id: string, organizationId: string, reason?: string, userId?: string): Promise<void> {
    const attendee = await this.attendeeRepository.findByIdScoped(id, organizationId);
    if (!attendee || attendee.deletedAt) {
      throw new AppError(404, 'Attendee not found');
    }

    // Business rule: Cannot delete attendee with active room assignment
    const assignment = await this.assignmentRepository.findByAttendeeId(id, organizationId);
    if (assignment) {
      throw new AppError(
        409,
        'Cannot delete attendee with active room assignment. Please unassign first.'
      );
    }

    await this.attendeeRepository.softDelete(id, organizationId, reason);

    // Create audit log
    await this.auditLogRepository.createLog({
      action: 'delete',
      entityType: 'attendee',
      entityId: id,
      details: { fullName: attendee.fullName, reason },
      organizationId,
      userId,
    });

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        organizationId,
        NotificationEvent.ATTENDEE_DELETED,
        NotificationType.WARNING,
        `Attendee "${attendee.fullName}" deleted`,
        'Attendee Deleted',
        { attendeeId: id, fullName: attendee.fullName, reason }
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  /**
   * Bulk delete attendees (soft delete)
   * WHY: Support selection-based bulk removal from the UI while preserving
   * the same business rules and audit trail as a single delete
   */
  async bulkDelete(
    ids: string[],
    organizationId: string,
    reason?: string,
    userId?: string
  ): Promise<{ deleted: string[]; failed: { id: string; error: string }[] }> {
    const deleted: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const id of ids) {
      try {
        await this.delete(id, organizationId, reason, userId);
        deleted.push(id);
      } catch (error) {
        failed.push({
          id,
          error: error instanceof AppError ? error.message : 'Failed to delete attendee',
        });
      }
    }

    return { deleted, failed };
  }

  /**
   * Reactivate attendee
   * WHY: Restore previously deleted/cancelled attendee
   */
  async reactivate(id: string, organizationId: string, userId?: string): Promise<Attendee> {
    const attendee = await this.attendeeRepository.findByIdScoped(id, organizationId);
    if (!attendee || !attendee.deletedAt) {
      throw new AppError(400, 'Attendee is not deleted or does not exist');
    }

    const reactivated = await this.attendeeRepository.reactivate(id, organizationId);

    // Create audit log
    await this.auditLogRepository.createLog({
      action: 'update',
      entityType: 'attendee',
      entityId: id,
      details: { fullName: reactivated.fullName, status: 'reactivated' },
      organizationId,
      userId,
    });

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        organizationId,
        NotificationEvent.ATTENDEE_CREATED,
        NotificationType.SUCCESS,
        `Attendee "${reactivated.fullName}" reactivated`,
        'Attendee Reactivated',
        { attendeeId: id, fullName: reactivated.fullName }
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }

    return reactivated;
  }

  /**
   * Check in attendee
   * WHY: Mark attendee as present at conference
   */
  async checkIn(id: string, organizationId: string, userId?: string): Promise<Attendee> {
    const attendee = await this.attendeeRepository.findByIdScoped(id, organizationId);
    if (!attendee || attendee.deletedAt) {
      throw new AppError(404, 'Attendee not found');
    }

    // Business rule: Cannot check in if already checked in
    if (attendee.checkedInAt && !attendee.checkedOutAt) {
      throw new AppError(409, 'Attendee is already checked in');
    }

    // Optional: Require room assignment before check-in
    // const assignment = await this.assignmentRepository.findByAttendeeId(id, organizationId);
    // if (!assignment) {
    //   throw new AppError(409, 'Attendee must be assigned to a room before check-in');
    // }

    const checkedIn = await this.attendeeRepository.checkIn(id, organizationId);

    // Create audit log
    await this.auditLogRepository.createLog({
      action: 'check_in',
      entityType: 'attendee',
      entityId: id,
      details: { fullName: checkedIn.fullName, timestamp: checkedIn.checkedInAt },
      organizationId,
      userId,
    });

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        organizationId,
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
  async checkOut(id: string, organizationId: string, userId?: string): Promise<Attendee> {
    const attendee = await this.attendeeRepository.findByIdScoped(id, organizationId);
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

    const checkedOut = await this.attendeeRepository.checkOut(id, organizationId);

    // Optional: Auto-unassign from room on checkout
    const assignment = await this.assignmentRepository.findByAttendeeId(id, organizationId);
    if (assignment) {
      await this.assignmentRepository.deleteScoped(assignment.id, organizationId);
      await this.auditLogRepository.createLog({
        action: 'unassign',
        entityType: 'room_assignment',
        entityId: assignment.id,
        details: { reason: 'auto_unassign_on_checkout' },
        organizationId,
        userId,
      });
    }

    // Create audit log
    await this.auditLogRepository.createLog({
      action: 'check_out',
      entityType: 'attendee',
      entityId: id,
      details: { fullName: checkedOut.fullName, timestamp: checkedOut.checkedOutAt },
      organizationId,
      userId,
    });

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        organizationId,
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
  async getStatistics(organizationId: string) {
    return this.attendeeRepository.getStatistics(organizationId);
  }

  /**
   * Get unassigned attendees
   * WHY: Show people who need room assignments
   * Supports optional search with dual-language
   */
  async getUnassigned(organizationId: string, params?: UnassignedFilterParams) {
    return this.attendeeRepository.findUnassigned(organizationId, params?.search, params?.dualSearch);
  }

  /**
   * Search assigned attendees with dual-language support
   * WHY: For swap modal - find attendees to swap
   */
  async searchAssigned(query: string, organizationId: string) {
    return this.attendeeRepository.searchAssigned(query, organizationId);
  }
}
