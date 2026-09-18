/**
 * Dashboard Service
 *
 * WHY: Business logic for dashboard statistics and metrics
 * Aggregates data from multiple repositories for overview displays
 */

import { AttendeeRepository } from '@/repositories/AttendeeRepository';
import { RoomRepository } from '@/repositories/RoomRepository';
import { RoomAssignmentRepository } from '@/repositories/RoomAssignmentRepository';
import { AuditLogRepository } from '@/repositories/AuditLogRepository';
import { ConferenceHouseRepository } from '@/repositories/ConferenceHouseRepository';

export class DashboardService {
  constructor(
    private attendeeRepository: AttendeeRepository,
    private roomRepository: RoomRepository,
    private assignmentRepository: RoomAssignmentRepository,
    private auditLogRepository: AuditLogRepository,
    private conferenceHouseRepository: ConferenceHouseRepository
  ) {}

  /**
   * Get overall system statistics
   * WHY: Dashboard overview with key metrics
   */
  async getOverallStats(organizationId: string) {
    const [attendeeStats, roomStats, assignmentStats, auditStats] = await Promise.all([
      this.attendeeRepository.getStatistics(organizationId),
      this.getRoomStatistics(organizationId),
      this.getAssignmentStatistics(organizationId),
      this.auditLogRepository.getStatistics(organizationId),
    ]);

    const occupancyRate = roomStats.totalRooms > 0
      ? ((roomStats.occupiedRooms / roomStats.totalRooms) * 100).toFixed(2)
      : '0.00';

    return {
      attendees: {
        total: attendeeStats.total,
        checkedIn: attendeeStats.checkedIn,
        withAssignment: attendeeStats.withAssignment,
        byRole: attendeeStats.byRole,
      },
      rooms: {
        total: roomStats.totalRooms,
        occupied: roomStats.occupiedRooms,
        available: roomStats.availableRooms,
        occupancyRate: parseFloat(occupancyRate),
      },
      assignments: {
        total: assignmentStats.total,
        today: assignmentStats.today,
      },
      activity: {
        totalActions: auditStats.totalActions,
        byAction: auditStats.byAction,
      },
    };
  }

  /**
   * Get room statistics
   * WHY: Room availability metrics
   */
  private async getRoomStatistics(organizationId: string) {
    const totalRooms = await this.roomRepository.countByOrganization(organizationId);
    const availability = await this.assignmentRepository.getRoomAvailability(organizationId);

    const occupiedRooms = availability.filter(r => r.occupied > 0).length;
    const availableRooms = availability.filter(r => r.available > 0).length;

    return {
      totalRooms,
      occupiedRooms,
      availableRooms,
    };
  }

  /**
   * Get assignment statistics
   * WHY: Track assignment activity
   */
  private async getAssignmentStatistics(organizationId: string) {
    const availability = await this.assignmentRepository.getRoomAvailability(organizationId);
    const total = availability.reduce((sum, r) => sum + r.occupied, 0);

    // Count assignments created today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayAssignments = await this.assignmentRepository.countCreatedSince(today, organizationId);

    return {
      total,
      today: todayAssignments,
    };
  }

  /**
   * Get room occupancy by building/floor
   * WHY: Visual breakdown of occupancy across facilities
   */
  async getOccupancyBreakdown(organizationId: string) {
    const conferenceHouses = await this.conferenceHouseRepository.findAllWithHierarchy(organizationId);
    const availability = await this.assignmentRepository.getRoomAvailability(organizationId);

    // Create map of room availability by room ID
    const availabilityMap = new Map(availability.map(r => [r.id, r]));

    return conferenceHouses.map(house => ({
      id: house.id,
      name: house.name,
      buildings: house.buildings.map(building => ({
        id: building.id,
        name: building.name,
        floors: building.floors.map(floor => {
          const floorRooms = floor.rooms.map(room => availabilityMap.get(room.id)).filter(Boolean);
          const totalCapacity = floorRooms.reduce((sum, r) => sum + (r?.capacity || 0), 0);
          const totalOccupied = floorRooms.reduce((sum, r) => sum + (r?.occupied || 0), 0);

          return {
            id: floor.id,
            floorNumber: floor.floorNumber,
            name: floor.name,
            roomCount: floor.rooms.length,
            capacity: totalCapacity,
            occupied: totalOccupied,
            available: totalCapacity - totalOccupied,
            occupancyRate: totalCapacity > 0 ? ((totalOccupied / totalCapacity) * 100).toFixed(2) : '0.00',
          };
        }),
      })),
    }));
  }

  /**
   * Get recent activity
   * WHY: Show latest system actions
   */
  async getRecentActivity(organizationId: string, limit: number = 20) {
    return this.auditLogRepository.getRecentActivity(organizationId, limit);
  }

  /**
   * Get check-in/check-out report
   * WHY: Track attendance over time
   */
  async getCheckInReport(organizationId: string) {
    const attendees = await this.attendeeRepository.findAllByOrganization(organizationId);

    const checkedIn = attendees.filter(a => a.checkedInAt && !a.checkedOutAt && !a.deletedAt);
    const checkedOut = attendees.filter(a => a.checkedOutAt && !a.deletedAt);
    const notCheckedIn = attendees.filter(a => !a.checkedInAt && !a.deletedAt);

    return {
      checkedIn: {
        count: checkedIn.length,
        attendees: checkedIn.map(a => ({
          id: a.id,
          fullName: a.fullName,
          checkedInAt: a.checkedInAt,
          role: a.conferenceRole,
        })),
      },
      checkedOut: {
        count: checkedOut.length,
        attendees: checkedOut.map(a => ({
          id: a.id,
          fullName: a.fullName,
          checkedInAt: a.checkedInAt,
          checkedOutAt: a.checkedOutAt,
          role: a.conferenceRole,
        })),
      },
      notCheckedIn: {
        count: notCheckedIn.length,
        attendees: notCheckedIn.map(a => ({
          id: a.id,
          fullName: a.fullName,
          role: a.conferenceRole,
        })),
      },
    };
  }
}
