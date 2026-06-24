/**
 * Excel Service
 * 
 * WHY: Handles Excel import/export for bulk operations
 * Uses SheetJS (xlsx) library for reading and writing Excel files
 */

import * as XLSX from 'xlsx';
import { Gender, ConferenceRole } from '@prisma/client';

export interface AttendeeExcelRow {
  fullName: string;
  phone?: string;
  email?: string;
  age?: number;
  gender?: Gender;
  churchOrg?: string;
  conferenceRole?: ConferenceRole;
  notes?: string;
}

export interface AssignmentExcelRow {
  attendeeName: string;
  building: string;
  floor: number;
  roomNumber: string;
}

export interface ValidationError {
  row: number;
  field: string;
  value: any;
  message: string;
}

export class ExcelService {
  /**
   * Parse attendees from Excel buffer
   * WHY: Import attendees in bulk
   */
  parseAttendeesFromExcel(buffer: Buffer): { data: AttendeeExcelRow[]; errors: ValidationError[] } {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Convert sheet to JSON
    const rawData: any[] = XLSX.utils.sheet_to_json(sheet);
    
    const data: AttendeeExcelRow[] = [];
    const errors: ValidationError[] = [];

    rawData.forEach((row, index) => {
      const rowNumber = index + 2; // +2 because Excel is 1-indexed and first row is header
      
      // Validate required fields
      if (!row['Full Name'] && !row['fullName']) {
        errors.push({
          row: rowNumber,
          field: 'fullName',
          value: null,
          message: 'Full name is required',
        });
        return;
      }

      // Map Excel columns to our schema
      const attendee: AttendeeExcelRow = {
        fullName: row['Full Name'] || row['fullName'],
        phone: row['Phone'] || row['phone'],
        email: row['Email'] || row['email'],
        age: row['Age'] || row['age'] ? parseInt(row['Age'] || row['age']) : undefined,
        gender: this.parseGender(row['Gender'] || row['gender']),
        churchOrg: row['Church/Organization'] || row['churchOrg'] || row['Church'] || row['Organization'],
        conferenceRole: this.parseRole(row['Role'] || row['conferenceRole']),
        notes: row['Notes'] || row['notes'],
      };

      // Validate email format if provided
      if (attendee.email && !this.isValidEmail(attendee.email)) {
        errors.push({
          row: rowNumber,
          field: 'email',
          value: attendee.email,
          message: 'Invalid email format',
        });
      }

      // Validate age if provided
      if (attendee.age && (attendee.age < 1 || attendee.age > 150)) {
        errors.push({
          row: rowNumber,
          field: 'age',
          value: attendee.age,
          message: 'Age must be between 1 and 150',
        });
      }

      data.push(attendee);
    });

    return { data, errors };
  }

  /**
   * Generate Excel file from attendees data
   * WHY: Export attendees for external use
   */
  generateAttendeesExcel(attendees: any[]): Buffer {
    // Map attendees to Excel-friendly format
    const excelData = attendees.map(attendee => ({
      'Full Name': attendee.fullName,
      'Phone': attendee.phone || '',
      'Email': attendee.email || '',
      'Age': attendee.age || '',
      'Gender': attendee.gender || '',
      'Church/Organization': attendee.churchOrg || '',
      'Role': attendee.conferenceRole || 'ATTENDEE',
      'Notes': attendee.notes || '',
      'Checked In': attendee.checkedInAt ? 'Yes' : 'No',
      'Checked In At': attendee.checkedInAt ? new Date(attendee.checkedInAt).toLocaleString() : '',
      'Room Number': attendee.assignment?.room?.roomNumber || '',
      'Building': attendee.assignment?.room?.floor?.building?.name || '',
      'Floor': attendee.assignment?.room?.floor?.floorNumber || '',
    }));

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendees');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 25 }, // Full Name
      { wch: 15 }, // Phone
      { wch: 25 }, // Email
      { wch: 5 },  // Age
      { wch: 10 }, // Gender
      { wch: 25 }, // Church/Organization
      { wch: 12 }, // Role
      { wch: 30 }, // Notes
      { wch: 10 }, // Checked In
      { wch: 20 }, // Checked In At
      { wch: 12 }, // Room Number
      { wch: 25 }, // Building
      { wch: 8 },  // Floor
    ];

    // Generate buffer
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /**
   * Generate assignments report Excel
   * WHY: Export room assignments for reporting
   */
  generateAssignmentsExcel(assignments: any[]): Buffer {
    const excelData = assignments.map(assignment => ({
      'Attendee Name': assignment.attendee.fullName,
      'Phone': assignment.attendee.phone || '',
      'Email': assignment.attendee.email || '',
      'Gender': assignment.attendee.gender || '',
      'Role': assignment.attendee.conferenceRole || '',
      'Conference House': assignment.room.floor.building.conferenceHouse.name,
      'Building': assignment.room.floor.building.name,
      'Floor': assignment.room.floor.floorNumber,
      'Room Number': assignment.room.roomNumber,
      'Room Type': assignment.room.roomType,
      'Room Capacity': assignment.room.capacity,
      'Assigned At': new Date(assignment.assignedAt).toLocaleString(),
      'Checked In': assignment.attendee.checkedInAt ? 'Yes' : 'No',
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Assignments');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 25 }, // Attendee Name
      { wch: 15 }, // Phone
      { wch: 25 }, // Email
      { wch: 10 }, // Gender
      { wch: 12 }, // Role
      { wch: 30 }, // Conference House
      { wch: 25 }, // Building
      { wch: 8 },  // Floor
      { wch: 12 }, // Room Number
      { wch: 12 }, // Room Type
      { wch: 12 }, // Room Capacity
      { wch: 20 }, // Assigned At
      { wch: 10 }, // Checked In
    ];

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /**
   * Generate Excel template for attendee import
   * WHY: Provide users with a template to fill
   */
  generateAttendeeTemplate(): Buffer {
    const templateData = [
      {
        'Full Name': 'John Doe',
        'Phone': '01234567890',
        'Email': 'john@example.com',
        'Age': 30,
        'Gender': 'MALE',
        'Church/Organization': 'Sample Church',
        'Role': 'ATTENDEE',
        'Notes': 'Sample notes',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendees');

    worksheet['!cols'] = [
      { wch: 25 },
      { wch: 15 },
      { wch: 25 },
      { wch: 5 },
      { wch: 10 },
      { wch: 25 },
      { wch: 12 },
      { wch: 30 },
    ];

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /**
   * Parse gender from string
   * WHY: Handle various formats (MALE, Male, male, M)
   */
  private parseGender(value: any): Gender | undefined {
    if (!value) return undefined;
    
    const normalized = String(value).toUpperCase().trim();
    
    if (normalized === 'MALE' || normalized === 'M') return 'MALE';
    if (normalized === 'FEMALE' || normalized === 'F') return 'FEMALE';
    if (normalized === 'OTHER' || normalized === 'O') return 'OTHER';
    
    return undefined;
  }

  /**
   * Parse conference role from string
   * WHY: Handle various formats
   */
  private parseRole(value: any): ConferenceRole {
    if (!value) return 'ATTENDEE';
    
    const normalized = String(value).toUpperCase().trim();
    
    const validRoles = ['LEADER', 'PASTOR', 'VIP', 'ATTENDEE', 'STAFF', 'VOLUNTEER', 'OTHER'];
    
    if (validRoles.includes(normalized)) {
      return normalized as ConferenceRole;
    }
    
    return 'ATTENDEE';
  }

  /**
   * Validate email format
   * WHY: Basic email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
