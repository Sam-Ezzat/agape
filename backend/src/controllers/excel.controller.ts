/**
 * Excel Controller
 * 
 * WHY: HTTP layer for Excel import/export operations
 * Handles file uploads and downloads
 */

import { Request, Response } from 'express';
import { ExcelService } from '@/services/excel.service';
import { AttendeeService } from '@/services/attendee.service';
import { RoomAssignmentRepository } from '@/repositories/RoomAssignmentRepository';
import { AppError } from '@/middleware/errorHandler';
import prisma from '@/utils/prisma-client';
import { getNotificationService } from '@/services/notification.service';
import { NotificationEvent, NotificationType } from '@/types/notifications';

export class ExcelController {
  constructor(
    private excelService: ExcelService,
    private attendeeService: AttendeeService,
    private assignmentRepository: RoomAssignmentRepository
  ) {}

  /**
   * POST /api/excel/attendees/import
   * Import attendees from Excel file
   */
  async importAttendees(req: Request, res: Response) {
    if (!req.file) {
      throw new AppError(400, 'No file uploaded');
    }

    const organizationId = req.user!.organizationId;
    const { data, errors } = this.excelService.parseAttendeesFromExcel(req.file.buffer);

    // Import attendees that passed validation
    const imported = [];
    const failed = [...errors];
    const softDeletedMatched = [];

    for (let i = 0; i < data.length; i++) {
      try {
        const row = data[i];
        if (!row) continue;

        // Perform smart check based on duplicate ticketId to run upsert/updates or create cleanly
        let attendee;
        if (row.ticketId) {
          // WHY: ticketId is globally unique in the schema, but we must only
          // treat it as "existing" when it belongs to this organization —
          // otherwise we'd leak/overwrite another tenant's attendee record.
          const existing = await prisma.attendee.findFirst({
            where: { ticketId: row.ticketId, organizationId },
          });

          if (existing) {
            if (existing.deletedAt !== null) {
              // Soft-deleted attendee found in Excel sheet. Report but do not reactivate automatically.
              softDeletedMatched.push({
                id: existing.id,
                fullName: existing.fullName,
                ticketId: existing.ticketId,
                phone: existing.phone,
                email: existing.email,
                role: existing.conferenceRole,
                internalNotes: existing.internalNotes || '',
              });
              continue;
            }

            // Update the existing attendee's registration profile details instead of failing
            attendee = await prisma.attendee.update({
              where: { id: existing.id },
              data: {
                fullName: row.fullName,
                phone: row.phone || existing.phone,
                email: row.email || existing.email,
                age: row.age || existing.age,
                gender: row.gender || existing.gender,
                church: row.church || existing.church,
                area: row.area || existing.area,
                governorate: row.governorate || existing.governorate,
                arrivalMethod: row.arrivalMethod || existing.arrivalMethod,
                busPickupPoint: row.busPickupPoint || existing.busPickupPoint,
                paymentMethod: row.paymentMethod || existing.paymentMethod,
                paymentStatus: (row.paymentStatus || existing.paymentStatus) as any,
                transactionNumber: row.transactionNumber || existing.transactionNumber,
                conferenceRole: row.conferenceRole || existing.conferenceRole,
                notes: row.notes || existing.notes,
                roomingNotes: row.roomingNotes || existing.roomingNotes,
                internalNotes: row.internalNotes || existing.internalNotes,
              },
            });
          } else {
            // Safe creation of new unique Ticket entries
            attendee = await this.attendeeService.create(row as any, organizationId, req.user!.id, false);
          }
        } else {
          // If no Ticket ID provided, create cleanly
          attendee = await this.attendeeService.create(row as any, organizationId, req.user!.id, false);
        }

        imported.push(attendee);
      } catch (error) {
        failed.push({
          row: i + 2,
          field: 'general',
          value: data[i]?.fullName || 'Unknown',
          message: (error as Error).message,
        });
      }
    }

    // WHY: Each row's attendeeService.create() call above skips its own
    // per-row notification (notify=false) to avoid flooding the UI with one
    // toast per imported attendee — send a single summary instead.
    if (imported.length > 0) {
      try {
        getNotificationService().broadcast(
          organizationId,
          NotificationEvent.IMPORT_COMPLETED,
          NotificationType.SUCCESS,
          `Imported ${imported.length} attendee(s)${failed.length > 0 ? `, ${failed.length} failed` : ''}`,
          'Import Complete'
        );
      } catch (error) {
        console.error('Failed to send import notification:', error);
      }
    }

    res.json({
      success: true,
      data: {
        imported: imported.length,
        failed: failed.length,
        attendees: imported,
        errors: failed,
        softDeletedMatched,
      },
      message: `Imported ${imported.length} attendees, ${failed.length} failed`,
    });
  }

  /**
   * GET /api/excel/attendees/export
   * Export attendees to Excel file
   */
  async exportAttendees(req: Request, res: Response) {
    const organizationId = req.user!.organizationId;
    const params = {
      search: req.query.search as string,
      role: req.query.role as any,
      gender: req.query.gender as any,
      checkedIn: req.query.checkedIn === 'true' ? true : req.query.checkedIn === 'false' ? false : undefined,
      hasAssignment: req.query.hasAssignment === 'true' ? true : req.query.hasAssignment === 'false' ? false : undefined,
      page: 1,
      limit: 10000, // Export all (with reasonable limit)
    };

    const result = await this.attendeeService.list(params, organizationId);
    const buffer = this.excelService.generateAttendeesExcel(result.data);

    const filename = `attendees-${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /**
   * GET /api/excel/assignments/export
   * Export room assignments to Excel file
   */
  async exportAssignments(req: Request, res: Response) {
    const organizationId = req.user!.organizationId;
    const params = {
      roomId: req.query.roomId as string,
      buildingId: req.query.buildingId as string,
      floorId: req.query.floorId as string,
      page: 1,
      limit: 10000, // Export all
    };

    const result = await this.assignmentRepository.search(params, organizationId);
    const buffer = this.excelService.generateAssignmentsExcel(result.data);

    const filename = `assignments-${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /**
   * GET /api/excel/attendees/template
   * Download Excel template for attendee import
   */
  async downloadTemplate(req: Request, res: Response) {
    const buffer = this.excelService.generateAttendeeTemplate();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="attendee-import-template.xlsx"');
    res.send(buffer);
  }

  /**
   * POST /api/excel/rooms/import
   * Import rooms from Excel file
   */
  async importRooms(req: Request, res: Response) {
    if (!req.file) {
      throw new AppError(400, 'No file uploaded');
    }

    const { conferenceHouseId } = req.body || req.query;
    if (!conferenceHouseId) {
      throw new AppError(400, 'conferenceHouseId is required');
    }

    const organizationId = req.user!.organizationId;
    // WHY: Verify the conference house belongs to this org before importing
    // rooms into it — prevents writing rooms into another tenant's hierarchy.
    const conferenceHouse = await prisma.conferenceHouse.findFirst({
      where: { id: conferenceHouseId, organizationId },
      select: { id: true },
    });
    if (!conferenceHouse) {
      throw new AppError(404, 'Conference house not found');
    }

    const { data, errors } = this.excelService.parseRoomsFromExcel(req.file.buffer);

    const imported = [];
    const failed = [...errors];

    for (let i = 0; i < data.length; i++) {
      try {
        const row = data[i];
        if (!row) continue;

        // Use a database transaction to ensure Atomicity for each room import
        // Determine a numerical floor index sequence and descriptive name
        let floorNum = 0;
        const floorStrRaw = String(row.floorValue);
        const parsedFloorNumber = parseInt(floorStrRaw.replace(/[^\d]/g, ''), 10);
        if (!isNaN(parsedFloorNumber)) {
          floorNum = parsedFloorNumber;
        } else {
          // Fallback parsing strategies
          const normalizedFloorStr = floorStrRaw.toLowerCase().trim();
          if (normalizedFloorStr.includes('ground') || normalizedFloorStr.includes('ارضي') || normalizedFloorStr.includes('أرضي')) {
            floorNum = 0;
          } else if (normalizedFloorStr.includes('first') || normalizedFloorStr.includes('اول') || normalizedFloorStr.includes('أول')) {
            floorNum = 1;
          } else if (normalizedFloorStr.includes('second') || normalizedFloorStr.includes('ثاني') || normalizedFloorStr.includes('ثانى')) {
            floorNum = 2;
          } else if (normalizedFloorStr.includes('third') || normalizedFloorStr.includes('ثالع') || normalizedFloorStr.includes('ثالث')) {
            floorNum = 3;
          } else if (normalizedFloorStr.includes('fourth') || normalizedFloorStr.includes('رابع')) {
            floorNum = 4;
          } else if (normalizedFloorStr.includes('fifth') || normalizedFloorStr.includes('خامس')) {
            floorNum = 5;
          } else {
            floorNum = 0;
          }
        }

        await prisma.$transaction(async (tx) => {
          // 1. Find or create Building
          let building = await tx.building.findUnique({
            where: {
              conferenceHouseId_name: {
                conferenceHouseId,
                name: row.building,
              },
            },
          });

          if (!building) {
            building = await tx.building.create({
              data: {
                conferenceHouseId,
                name: row.building,
                floorCount: Math.max(1, floorNum),
              },
            });
          } else if (building.floorCount < floorNum) {
            // Update floorCount if the imported floor number is higher
            building = await tx.building.update({
              where: { id: building.id },
              data: { floorCount: floorNum },
            });
          }

          // 2. Find or create Floor
          let floor = await tx.floor.findUnique({
            where: {
              buildingId_floorNumber: {
                buildingId: building.id,
                floorNumber: floorNum,
              },
            },
          });

          if (!floor) {
            floor = await tx.floor.create({
              data: {
                buildingId: building.id,
                floorNumber: floorNum,
                name: floorStrRaw,
              },
            });
          }

          // 3. Find or create Room
          // Calculate room occupancy/capacity from beds
          const capacity = row.individualBeds + (2 * row.bunkBeds);

          let room = await tx.room.findUnique({
            where: {
              floorId_roomNumber: {
                floorId: floor.id,
                roomNumber: row.roomNumber,
              },
            },
          });

          if (room) {
            // Update existing room's capacity and bed counts
            room = await tx.room.update({
              where: { id: room.id },
              data: {
                capacity,
                individualBeds: row.individualBeds,
                bunkBeds: row.bunkBeds,
              },
            });
          } else {
            // Create new room
            room = await tx.room.create({
              data: {
                floorId: floor.id,
                roomNumber: row.roomNumber,
                capacity,
                individualBeds: row.individualBeds,
                bunkBeds: row.bunkBeds,
                roomType: 'GENERAL',
              },
            });
          }

          imported.push({
            roomId: room.id,
            roomNumber: room.roomNumber,
            building: row.building,
            floor: floorStrRaw,
          });
        });
      } catch (error) {
        failed.push({
          row: i + 2,
          field: 'general',
          value: data[i]?.roomNumber || 'Unknown',
          message: (error as Error).message,
        });
      }
    }

    res.json({
      success: true,
      data: {
        imported: imported.length,
        failed: failed.length,
        rooms: imported,
        errors: failed,
      },
      message: `Imported ${imported.length} rooms, ${failed.length} failed`,
    });
  }

  /**
   * GET /api/excel/rooms/export
   * Export rooms layout to Excel file
   */
  async exportRooms(req: Request, res: Response) {
    const { conferenceHouseId } = req.query;
    if (!conferenceHouseId) {
      throw new AppError(400, 'conferenceHouseId query parameter is required');
    }

    const organizationId = req.user!.organizationId;

    // Retrieve all rooms belonging to this conference house, scoped to org
    const rooms = await prisma.room.findMany({
      where: {
        floor: {
          building: {
            conferenceHouseId: String(conferenceHouseId),
            conferenceHouse: { organizationId },
          },
        },
      },
      include: {
        floor: {
          include: {
            building: true,
          },
        },
      },
      orderBy: [
        { floor: { building: { name: 'asc' } } },
        { floor: { floorNumber: 'asc' } },
        { roomNumber: 'asc' },
      ],
    });

    const buffer = this.excelService.generateRoomsExcel(rooms);
    const filename = `rooms-layout-${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /**
   * GET /api/excel/rooms/template
   * Download Excel template for rooms import
   */
  async downloadRoomsTemplate(req: Request, res: Response) {
    const buffer = this.excelService.generateRoomTemplate();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="rooms-import-template.xlsx"');
    res.send(buffer);
  }
}
