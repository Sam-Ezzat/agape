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

    const { data, errors } = this.excelService.parseAttendeesFromExcel(req.file.buffer);

    // Import attendees that passed validation
    const imported = [];
    const failed = [...errors];

    for (let i = 0; i < data.length; i++) {
      try {
        const row = data[i];
        if (!row) continue;
        const attendee = await this.attendeeService.create(row as any);
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

    res.json({
      success: true,
      data: {
        imported: imported.length,
        failed: failed.length,
        attendees: imported,
        errors: failed,
      },
      message: `Imported ${imported.length} attendees, ${failed.length} failed`,
    });
  }

  /**
   * GET /api/excel/attendees/export
   * Export attendees to Excel file
   */
  async exportAttendees(req: Request, res: Response) {
    const params = {
      search: req.query.search as string,
      role: req.query.role as any,
      gender: req.query.gender as any,
      checkedIn: req.query.checkedIn === 'true' ? true : req.query.checkedIn === 'false' ? false : undefined,
      hasAssignment: req.query.hasAssignment === 'true' ? true : req.query.hasAssignment === 'false' ? false : undefined,
      page: 1,
      limit: 10000, // Export all (with reasonable limit)
    };

    const result = await this.attendeeService.list(params);
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
    const params = {
      roomId: req.query.roomId as string,
      buildingId: req.query.buildingId as string,
      floorId: req.query.floorId as string,
      page: 1,
      limit: 10000, // Export all
    };

    const result = await this.assignmentRepository.search(params);
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
}
