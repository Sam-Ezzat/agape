/**
 * Excel Service
 * 
 * WHY: Handles Excel import/export for bulk operations
 * Uses SheetJS (xlsx) library for reading and writing Excel files
 * Updated to match conference registration Excel structure
 */

import * as XLSX from 'xlsx';
import { Gender, ConferenceRole } from '@prisma/client';

export interface AttendeeExcelRow {
  ticketId?: string;
  fullName: string;
  phone?: string;
  email?: string;
  age?: number;
  gender?: Gender;
  church?: string;
  area?: string;
  governorate?: string;
  arrivalMethod?: string;
  busPickupPoint?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  transactionNumber?: string;
  conferenceRole?: ConferenceRole;
  notes?: string;
  roomingNotes?: string;
  internalNotes?: string;
  checkedInBy?: string;
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
   * WHY: Import attendees in bulk from conference registration Excel format
   */
  parseAttendeesFromExcel(buffer: Buffer): { data: AttendeeExcelRow[]; errors: ValidationError[] } {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    // Use first sheet (typically "Registrations")
    const sheetName = workbook.SheetNames[0] || '';
    if (!sheetName) {
      return { data: [], errors: [{ row: 0, field: 'sheet', value: '', message: 'Sheet not found' }] };
    }
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
        ticketId: row['Ticket ID'] || row['ticketId'] || undefined,
        fullName: row['Full Name'] || row['fullName'],
        phone: this.normalizePhone(row['Phone'] || row['phone']),
        email: row['Email'] || row['email'] || undefined,
        age: row['Age'] || row['age'] ? parseInt(row['Age'] || row['age']) : undefined,
        gender: this.parseGender(row['Gender'] || row['gender']),
        church: row['Church'] || row['church'] || undefined,
        area: row['Area'] || row['area'] || undefined,
        governorate: row['Governorate'] || row['governorate'] || undefined,
        arrivalMethod: row['Arrival Method'] || row['arrivalMethod'] || undefined,
        busPickupPoint: row['Bus Pickup Point'] || row['busPickupPoint'] || undefined,
        paymentMethod: row['Payment Method'] || row['paymentMethod'] || undefined,
        paymentStatus: this.parsePaymentStatus(row['Payment Review Status'] || row['paymentStatus']),
        transactionNumber: row['Transaction Number'] || row['transactionNumber'] || undefined,
        conferenceRole: this.parseRole(row['Role'] || row['conferenceRole']),
        notes: row['Notes'] || row['notes'] || undefined,
        roomingNotes: row['Rooming Notes'] || row['roomingNotes'] || undefined,
        internalNotes: row['Internal Notes'] || row['internalNotes'] || undefined,
        checkedInBy: row['Checked-in By'] || row['checkedInBy'] || undefined,
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
   * WHY: Export attendees in conference registration format
   */
  generateAttendeesExcel(attendees: any[]): Buffer {
    // Map attendees to Excel-friendly format
    const excelData = attendees.map(attendee => ({
      'Ticket ID': attendee.ticketId || '',
      'Email': attendee.email || '',
      'Full Name': attendee.fullName,
      'Gender': this.formatGender(attendee.gender),
      'Phone': attendee.phone || '',
      'Age': attendee.age || '',
      'Church': attendee.church || '',
      'Area': attendee.area || '',
      'Governorate': attendee.governorate || '',
      'Arrival Method': attendee.arrivalMethod || '',
      'Bus Pickup Point': attendee.busPickupPoint || '',
      'Payment Method': attendee.paymentMethod || '',
      'Payment Review Status': attendee.paymentStatus || 'PENDING',
      'Transaction Number': attendee.transactionNumber || '',
      'Checked In': attendee.checkedInAt ? 'YES' : 'NO',
      'Check-in Time': attendee.checkedInAt ? new Date(attendee.checkedInAt).toLocaleString() : '',
      'Checked-in By': attendee.checkedInBy || '',
      'Notes': attendee.notes || '',
      'Rooming Notes': attendee.roomingNotes || '',
      'Internal Notes': attendee.internalNotes || '',
      'Role': attendee.conferenceRole || 'ATTENDEE',
      'Building': attendee.assignment?.room?.floor?.building?.name || '',
      'Floor': attendee.assignment?.room?.floor?.floorNumber || '',
      'Room Number': attendee.assignment?.room?.roomNumber || '',
    }));

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendees');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 20 }, // Ticket ID
      { wch: 25 }, // Email
      { wch: 25 }, // Full Name
      { wch: 10 }, // Gender
      { wch: 15 }, // Phone
      { wch: 5 },  // Age
      { wch: 20 }, // Church
      { wch: 15 }, // Area
      { wch: 15 }, // Governorate
      { wch: 15 }, // Arrival Method
      { wch: 20 }, // Bus Pickup Point
      { wch: 15 }, // Payment Method
      { wch: 18 }, // Payment Review Status
      { wch: 18 }, // Transaction Number
      { wch: 10 }, // Checked In
      { wch: 20 }, // Check-in Time
      { wch: 15 }, // Checked-in By
      { wch: 30 }, // Notes
      { wch: 30 }, // Rooming Notes
      { wch: 30 }, // Internal Notes
      { wch: 12 }, // Role
      { wch: 25 }, // Building
      { wch: 8 },  // Floor
      { wch: 12 }, // Room Number
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
   * WHY: Provide users with a template matching conference registration format
   */
  generateAttendeeTemplate(): Buffer {
    const templateData = [
      {
        'Ticket ID': 'TO-20260607-123456',
        'Email': 'john.doe@example.com',
        'Full Name': 'John Doe',
        'Gender': 'MALE',
        'Phone': '01234567890',
        'Age': 30,
        'Church': 'Sample Church',
        'Area': 'Sample Area',
        'Governorate': 'Cairo',
        'Arrival Method': 'Conference Bus',
        'Bus Pickup Point': 'Main Square',
        'Payment Method': 'InstaPay',
        'Payment Review Status': 'PENDING',
        'Transaction Number': 'TXN-123456',
        'Notes': 'Sample registration notes',
        'Rooming Notes': 'Prefer ground floor',
        'Internal Notes': 'Admin notes here',
        'Role': 'ATTENDEE',
      },
      {
        'Ticket ID': '',
        'Email': 'jane.smith@example.com',
        'Full Name': 'Jane Smith',
        'Gender': 'FEMALE',
        'Phone': '01098765432',
        'Age': 28,
        'Church': 'Another Church',
        'Area': 'Downtown',
        'Governorate': 'Alexandria',
        'Arrival Method': 'Private Transport',
        'Bus Pickup Point': '',
        'Payment Method': 'Orange Cash',
        'Payment Review Status': 'CONFIRMED',
        'Transaction Number': 'TXN-789012',
        'Notes': '',
        'Rooming Notes': '',
        'Internal Notes': '',
        'Role': 'STAFF',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendees');

    worksheet['!cols'] = [
      { wch: 20 }, // Ticket ID
      { wch: 25 }, // Email
      { wch: 25 }, // Full Name
      { wch: 10 }, // Gender
      { wch: 15 }, // Phone
      { wch: 5 },  // Age
      { wch: 20 }, // Church
      { wch: 15 }, // Area
      { wch: 15 }, // Governorate
      { wch: 18 }, // Arrival Method
      { wch: 20 }, // Bus Pickup Point
      { wch: 15 }, // Payment Method
      { wch: 18 }, // Payment Review Status
      { wch: 18 }, // Transaction Number
      { wch: 30 }, // Notes
      { wch: 30 }, // Rooming Notes
      { wch: 30 }, // Internal Notes
      { wch: 12 }, // Role
    ];

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /**
   * Parse gender from string (supports Arabic and English)
   * WHY: Handle various formats (MALE, Male, male, M, ذكر, أنثى)
   */
  private parseGender(value: any): Gender | undefined {
    if (!value) return undefined;
    
    const normalized = String(value).trim();
    
    // English
    if (normalized.toUpperCase() === 'MALE' || normalized.toUpperCase() === 'M') return 'MALE';
    if (normalized.toUpperCase() === 'FEMALE' || normalized.toUpperCase() === 'F') return 'FEMALE';
    if (normalized.toUpperCase() === 'OTHER' || normalized.toUpperCase() === 'O') return 'OTHER';
    
    // Arabic
    if (normalized === 'ذكر') return 'MALE';
    if (normalized === 'أنثى' || normalized === 'انثى') return 'FEMALE';
    
    return undefined;
  }

  /**
   * Format gender for display (English)
   * WHY: Consistent output format
   */
  private formatGender(value: any): string {
    if (!value) return '';
    if (value === 'MALE') return 'Male';
    if (value === 'FEMALE') return 'Female';
    if (value === 'OTHER') return 'Other';
    return value;
  }

  /**
   * Parse payment status from Excel
   * WHY: Map various status formats to our enum
   */
  private parsePaymentStatus(value: any): string {
    if (!value) return 'PENDING';
    
    const normalized = String(value).toUpperCase().trim();
    
    if (normalized === 'CONFIRMED' || normalized === 'APPROVED') return 'CONFIRMED';
    if (normalized === 'REJECTED' || normalized === 'DECLINED') return 'REJECTED';
    
    return 'PENDING';
  }

  /**
   * Normalize phone number
   * WHY: Handle phone numbers stored as numbers in Excel
   */
  private normalizePhone(value: any): string | undefined {
    if (!value) return undefined;
    
    // Convert to string and remove any spaces or special characters
    const phone = String(value).replace(/\s+/g, '').replace(/[^\d+]/g, '');
    
    return phone || undefined;
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
