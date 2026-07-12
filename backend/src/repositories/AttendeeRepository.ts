/**
 * Attendee Repository
 * 
 * WHY: Data access layer for attendee operations
 * Handles all Prisma queries for attendees with search and filtering
 */

import { Attendee, Prisma, PrismaClient } from '@prisma/client';
import { BaseRepository } from './BaseRepository';
import { CreateAttendeeDTO, UpdateAttendeeDTO, AttendeeFilterParams } from '@/validators/attendee.schemas';
import { SearchDualLanguageService } from '@/search/dual-language';

export class AttendeeRepository extends BaseRepository<Attendee, Prisma.AttendeeDelegate> {
  private dualLanguageSearch: SearchDualLanguageService;

  constructor(prisma: PrismaClient) {
    super(prisma, prisma.attendee);
    this.dualLanguageSearch = new SearchDualLanguageService();
  }

  /**
   * Find attendee by ID with assignment details
   * WHY: Common query to show attendee with room info
   */
  async findByIdWithDetails(id: string) {
    return this.prisma.attendee.findUnique({
      where: { id },
      include: {
        assignment: {
          include: {
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
        },
      },
    });
  }

  /* Supports dual-language search (English ↔ Arabic)
   */
  async search(params: AttendeeFilterParams) {
    const { search, role, gender, checkedIn, hasAssignment, page, limit, dualSearch } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.AttendeeWhereInput = {
      deletedAt: null, // Only non-deleted attendees
    };

    // Full-text search on name with optional dual-language support
    if (search) {
      if (dualSearch) {
        // Generate search candidates using dual-language engine
        const candidates = this.dualLanguageSearch.generateSearchCandidates(search);
        
        // Build OR query for all candidates
        where.OR = candidates.map(candidate => ({
          fullName: {
            contains: candidate,
            mode: 'insensitive' as const,
          },
        }));
      } else {
        // Standard single-language search
        where.fullName = {
          contains: search,
          mode: 'insensitive', // Case-insensitive search
        };
      }
    }

    // Filter by role
    if (role) {
      where.conferenceRole = role;
    }

    // Filter by gender
    if (gender) {
      where.gender = gender;
    }

    // Filter by checked-in status
    if (checkedIn !== undefined) {
      if (checkedIn) {
        where.checkedInAt = { not: null };
        where.checkedOutAt = null;
      } else {
        where.OR = [
          { checkedInAt: null },
          { checkedOutAt: { not: null } },
        ];
      }
    }

    // Filter by assignment status
    if (hasAssignment !== undefined) {
      if (hasAssignment) {
        where.assignment = { isNot: null };
      } else {
        where.assignment = null;
      }
    }

    const [attendees, total] = await Promise.all([
      this.prisma.attendee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assignment: {
            include: {
              room: {
                select: {
                  roomNumber: true,
                  floor: {
                    select: {
                      floorNumber: true,
                      building: {
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
      this.prisma.attendee.count({ where }),
    ]);

    return {
      data: attendees,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get attendees without assignments
   * WHY: Needed for assignment workflows
   * Supports optional search with dual-language
   */
  async findUnassigned(search?: string, dualSearch?: boolean) {
    const where: Prisma.AttendeeWhereInput = {
      deletedAt: null,
      assignment: null,
    };

    // Add search if provided
    if (search) {
      if (dualSearch) {
        // Generate search candidates using dual-language engine
        const candidates = this.dualLanguageSearch.generateSearchCandidates(search);
        
        // Build OR query for all candidates
        where.OR = candidates.map(candidate => ({
          fullName: {
            contains: candidate,
            mode: 'insensitive' as const,
          },
        }));
      } else {
        // Standard single-language search
        where.fullName = {
          contains: search,
          mode: 'insensitive',
        };
      }
    }

    return this.prisma.attendee.findMany({
      where,
      orderBy: { fullName: 'asc' },
    });
  }

  /**
   * Search assigned attendees with dual-language support
   * WHY: For swap modal - includes room assignments and uses scoring
   */
  async searchAssigned(query: string) {
    // Get all assigned attendees with room details
    const attendees = await this.prisma.attendee.findMany({
      where: {
        deletedAt: null,
        assignment: { isNot: null },
      },
      include: {
        assignment: {
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
        },
      },
      orderBy: { fullName: 'asc' },
    });

    // If no query, return all
    if (!query || query.trim().length === 0) {
      return attendees;
    }

    // Use dual-language search with scoring
    const results = this.dualLanguageSearch.searchWithScoring(
      query,
      attendees,
      (attendee) => attendee.fullName
    );

    // Return sorted by relevance score (highest first)
    return results.map(result => result.item);
  }

  /**
   * Count attendees by status
   * WHY: Dashboard statistics
   */
  async getStatistics() {
    const [total, checkedIn, withAssignment, byRole] = await Promise.all([
      this.prisma.attendee.count({
        where: { deletedAt: null },
      }),
      this.prisma.attendee.count({
        where: {
          deletedAt: null,
          checkedInAt: { not: null },
          checkedOutAt: null,
        },
      }),
      this.prisma.attendee.count({
        where: {
          deletedAt: null,
          assignment: { isNot: null },
        },
      }),
      this.prisma.attendee.groupBy({
        by: ['conferenceRole'],
        where: { deletedAt: null },
        _count: true,
      }),
    ]);

    return {
      total,
      checkedIn,
      withAssignment,
      byRole: Object.fromEntries(
        byRole.map((r) => [r.conferenceRole, r._count])
      ),
    };
  }

  /**
   * Soft delete attendee
   * WHY: Preserves data for audit trail
   */
  async softDelete(id: string) {
    return this.prisma.attendee.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Check in attendee
   * WHY: Updates check-in timestamp
   */
  async checkIn(id: string) {
    return this.prisma.attendee.update({
      where: { id },
      data: {
        checkedInAt: new Date(),
        checkedOutAt: null,
      },
    });
  }

  /**
   * Check out attendee
   * WHY: Updates check-out timestamp
   */
  async checkOut(id: string) {
    return this.prisma.attendee.update({
      where: { id },
      data: { checkedOutAt: new Date() },
    });
  }
}
