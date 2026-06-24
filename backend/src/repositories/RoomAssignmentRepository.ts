/**
 * Room Assignment Repository
 * 
 * WHY: Data access layer for room assignment operations
 * Handles all Prisma queries for managing room-attendee mappings
 */

import { RoomAssignment, Prisma, PrismaClient } from '@prisma/client';
import { BaseRepository } from './BaseRepository';
import { CreateAssignmentDTO, UpdateAssignmentDTO, AssignmentFilterParams } from '@/validators/assignment.schemas';

export class RoomAssignmentRepository extends BaseRepository<RoomAssignment, Prisma.RoomAssignmentDelegate> {
  constructor(prisma: PrismaClient) {
    super(prisma, prisma.roomAssignment);
  }

  /**
   * Find assignment by ID with full details
   * WHY: Common query to show assignment with attendee and room info
   */
  async findByIdWithDetails(id: string) {
    return this.prisma.roomAssignment.findUnique({
      where: { id },
      include: {
        attendee: true,
        room: {
          include: {
            floor: {
              include: {
                building: {
                  include: {
                    conferenceHouse: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find assignment by attendee ID
   * WHY: Check if attendee is already assigned
   */
  async findByAttendeeId(attendeeId: string) {
    return this.prisma.roomAssignment.findUnique({
      where: { attendeeId },
      include: {
        room: {
          include: {
            floor: {
              include: {
                building: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find all assignments for a room
   * WHY: Check room capacity and current occupants
   */
  async findByRoomId(roomId: string) {
    return this.prisma.roomAssignment.findMany({
      where: { roomId },
      include: {
        attendee: {
          select: {
            id: true,
            fullName: true,
            gender: true,
            conferenceRole: true,
            checkedInAt: true,
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  /**
   * Search assignments with filters
   * WHY: Filter by room, building, or floor
   */
  async search(params: AssignmentFilterParams) {
    const { roomId, buildingId, floorId, page, limit } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.RoomAssignmentWhereInput = {};

    if (roomId) {
      where.roomId = roomId;
    }

    if (buildingId) {
      where.room = {
        floor: {
          buildingId,
        },
      };
    }

    if (floorId) {
      where.room = {
        floorId,
      };
    }

    const [assignments, total] = await Promise.all([
      this.prisma.roomAssignment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { assignedAt: 'desc' },
        include: {
          attendee: {
            select: {
              id: true,
              fullName: true,
              gender: true,
              conferenceRole: true,
              phone: true,
              checkedInAt: true,
            },
          },
          room: {
            select: {
              id: true,
              roomNumber: true,
              capacity: true,
              roomType: true,
              floor: {
                select: {
                  floorNumber: true,
                  name: true,
                  building: {
                    select: {
                      name: true,
                      conferenceHouse: {
                        select: {
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.roomAssignment.count({ where }),
    ]);

    return {
      data: assignments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Count assignments in a room
   * WHY: Capacity validation
   */
  async countByRoomId(roomId: string): Promise<number> {
    return this.prisma.roomAssignment.count({
      where: { roomId },
    });
  }

  /**
   * Get room availability summary
   * WHY: Dashboard and assignment UI need this data
   */
  async getRoomAvailability() {
    const rooms = await this.prisma.room.findMany({
      select: {
        id: true,
        roomNumber: true,
        capacity: true,
        roomType: true,
        floor: {
          select: {
            floorNumber: true,
            name: true,
            building: {
              select: {
                name: true,
                conferenceHouse: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            assignments: true,
          },
        },
      },
      orderBy: [
        { floor: { building: { name: 'asc' } } },
        { floor: { floorNumber: 'asc' } },
        { roomNumber: 'asc' },
      ],
    });

    return rooms.map((room) => ({
      ...room,
      occupied: room._count.assignments,
      available: room.capacity - room._count.assignments,
      occupancyRate: (room._count.assignments / room.capacity) * 100,
    }));
  }

  /**
   * Batch create assignments
   * WHY: Efficient bulk insert
   */
  async createMany(data: CreateAssignmentDTO[]) {
    return this.prisma.roomAssignment.createMany({
      data,
      skipDuplicates: true, // Skip if attendee already assigned
    });
  }
}
