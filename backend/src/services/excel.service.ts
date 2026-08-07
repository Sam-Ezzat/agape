/**
 * Excel Service
 * 
 * WHY: Handles Excel import/export for bulk operations
 * Uses SheetJS (xlsx) library for reading and writing Excel files
 * Updated to match conference registration Excel structure
 */

import * as XLSX from 'xlsx';
import { Gender, ConferenceRole } from '@prisma/client';
import { toE164 } from '@/utils/phone';

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
  isServant?: boolean;
  arrivalMethod?: string;
  busPickupPoint?: string;
  mealType?: string;
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

export interface RoomExcelRow {
  building: string;
  floorValue: string | number; // Accept string, number or word representation
  roomNumber: string;
  individualBeds: number;
  bunkBeds: number;
  kingBeds: number;
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
      const rawTransactionNumberRaw = row['Transaction Number'] || row['transactionNumber'];
      const rawTransactionNumber = rawTransactionNumberRaw !== undefined && rawTransactionNumberRaw !== null ? String(rawTransactionNumberRaw).trim() : undefined;

      const rawPhone = row['Phone'] || row['phone'];
      let normalizedPhone: string | undefined;
      let phoneError: string | undefined;
      if (rawPhone !== undefined && rawPhone !== null && String(rawPhone).trim() !== '') {
        try {
          normalizedPhone = toE164(String(rawPhone));
        } catch (error) {
          phoneError = error instanceof Error ? error.message : 'Invalid phone number';
        }
      }

      const attendee: AttendeeExcelRow = {
        ticketId: row['Ticket ID'] || row['ticketId'] || undefined,
        fullName: row['Full Name'] || row['fullName'],
        phone: normalizedPhone,
        email: row['Email'] || row['email'] || undefined,
        age: row['Age'] || row['age'] ? parseInt(row['Age'] || row['age']) : undefined,
        gender: this.parseGender(row['Gender'] || row['gender']),
        church: row['Church'] || row['church'] || undefined,
        area: row['Area'] || row['area'] || undefined,
        governorate: row['Governorate'] || row['governorate'] || undefined,
        isServant: this.parseIsServant(row['Are you a servant in your church?'] || row['isServant']),
        arrivalMethod: row['Arrival Method'] || row['arrivalMethod'] || undefined,
        busPickupPoint: row['Bus Pickup Point'] || row['busPickupPoint'] || undefined,
        mealType: this.parseMealType(row['Meal Type'] || row['mealType']),
        paymentMethod: row['Payment Method'] || row['paymentMethod'] || undefined,
        paymentStatus: this.parsePaymentStatus(row['Payment Review Status'] || row['paymentStatus']),
        transactionNumber: rawTransactionNumber,
        conferenceRole: this.parseRole(row['Role'] || row['conferenceRole']),
        notes: row['Notes'] || row['notes'] || undefined,
        roomingNotes: row['Rooming Notes'] || row['roomingNotes'] || undefined,
        internalNotes: row['Internal Notes'] || row['internalNotes'] || undefined,
        checkedInBy: row['Checked-in By'] || row['checkedInBy'] || undefined,
      };

      // Validate phone format if provided — must normalize to a full
      // international number (country code + subscriber number)
      if (phoneError) {
        errors.push({
          row: rowNumber,
          field: 'phone',
          value: rawPhone,
          message: phoneError,
        });
      }

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
      'Phone': this.formatPhoneForExport(attendee.phone),
      'Age': attendee.age || '',
      'Church': attendee.church || '',
      'Area': attendee.area || '',
      'Governorate': attendee.governorate || '',
      'Are you a servant in your church?': attendee.isServant === true ? 'Yes' : attendee.isServant === false ? 'No' : '',
      'Arrival Method': attendee.arrivalMethod || '',
      'Bus Pickup Point': attendee.busPickupPoint || '',
      'Meal Type': attendee.mealType || '',
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
      { wch: 30 }, // Are you a servant in your church?
      { wch: 15 }, // Arrival Method
      { wch: 20 }, // Bus Pickup Point
      { wch: 15 }, // Meal Type
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
      'Phone': this.formatPhoneForExport(assignment.attendee.phone),
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
        'Phone': '+201234567890',
        'Age': 30,
        'Church': 'Sample Church',
        'Area': 'Sample Area',
        'Governorate': 'Cairo',
        'Are you a servant in your church?': 'Yes',
        'Arrival Method': 'Conference Bus',
        'Bus Pickup Point': 'Main Square',
        'Meal Type': 'وجبات صيامي',
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
        'Phone': '+201098765432',
        'Age': 28,
        'Church': 'Another Church',
        'Area': 'Downtown',
        'Governorate': 'Alexandria',
        'Are you a servant in your church?': 'No',
        'Arrival Method': 'Private Transport',
        'Bus Pickup Point': '',
        'Meal Type': 'وجبات فطاري',
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
      { wch: 30 }, // Are you a servant in your church?
      { wch: 18 }, // Arrival Method
      { wch: 20 }, // Bus Pickup Point
      { wch: 15 }, // Meal Type
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
   * Parse "is servant" flag from Excel (supports Arabic and English)
   * WHY: Handle various formats (Yes/No, نعم/لا, true/false)
   */
  private parseIsServant(value: any): boolean | undefined {
    if (value === undefined || value === null || value === '') return undefined;

    const normalized = String(value).trim().toUpperCase();

    if (normalized === 'YES' || normalized === 'TRUE' || normalized === 'Y') return true;
    if (normalized === 'NO' || normalized === 'FALSE' || normalized === 'N') return false;

    const raw = String(value).trim();
    if (raw === 'نعم') return true;
    if (raw === 'لا') return false;

    return undefined;
  }

  /**
   * Parse meal type from Excel (Arabic values only)
   * WHY: Restrict import to the two supported meal options
   */
  private parseMealType(value: any): string | undefined {
    if (!value) return undefined;

    const normalized = String(value).trim();

    if (normalized === 'وجبات صيامي') return 'وجبات صيامي';
    if (normalized === 'وجبات فطاري') return 'وجبات فطاري';

    return undefined;
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
   * Format a stored phone number for export.
   * WHY: Attendees are stored in E.164 (+countrycode...) format, but older
   * records created before that was enforced may still be un-normalized —
   * best-effort normalize on the way out rather than leaving a mix of formats
   * in exported sheets.
   */
  private formatPhoneForExport(phone: string | null | undefined): string {
    if (!phone) return '';
    try {
      return toE164(phone);
    } catch {
      return phone;
    }
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

  /**
   * Parse rooms from Excel buffer
   * WHY: Import rooms and floor layout in bulk from Excel format
   */
  parseRoomsFromExcel(buffer: Buffer): { data: RoomExcelRow[]; errors: ValidationError[] } {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0] || '';
    if (!sheetName) {
      return { data: [], errors: [{ row: 0, field: 'sheet', value: '', message: 'Sheet not found' }] };
    }
    const sheet = workbook.Sheets[sheetName];
    const rawData: any[] = XLSX.utils.sheet_to_json(sheet);
    
    const data: RoomExcelRow[] = [];
    const errors: ValidationError[] = [];

    rawData.forEach((row, index) => {
      const rowNumber = index + 2; // Excel is 1-indexed and has header row
      
      const buildingRaw = row['Building'] || row['building'];
      
      // Support either separate "Floor Number" and "Floor Name" columns, or a single "Floor" column
      const floorRaw = row['Floor'] || row['floor'] || row['Floor Name'] || row['floorName'] || row['floor_name'];
      const floorNumberRaw = row['Floor Number'] || row['floorNumber'] || row['floor_number'] || row['FloorNumber'];
      
      const roomNumberRaw = row['Room'] || row['room'] || row['Room Number'] || row['roomNumber'] || row['RoomNumber'];
      const individualBedsRaw = row['Individual Beds'] || row['individual beds'] || row['individual_beds'] || row['individualBeds'] || row['IndividualBeds'];
      const bunkBedsRaw = row['Bunk Beds'] || row['bunk beds'] || row['bunk_beds'] || row['bunkBeds'] || row['BunkBeds'];
      const kingBedsRaw = row['King Beds'] || row['king beds'] || row['king_beds'] || row['kingBeds'] || row['KingBeds'];

      if (!buildingRaw) {
        errors.push({
          row: rowNumber,
          field: 'building',
          value: null,
          message: 'Building name is required',
        });
        return;
      }

      if ((floorRaw === undefined || floorRaw === null || floorRaw === '') && 
          (floorNumberRaw === undefined || floorNumberRaw === null || floorNumberRaw === '')) {
        errors.push({
          row: rowNumber,
          field: 'floor',
          value: null,
          message: 'Floor information is required (Floor or Floor Number)',
        });
        return;
      }

      if (!roomNumberRaw) {
        errors.push({
          row: rowNumber,
          field: 'roomNumber',
          value: null,
          message: 'Room number is required',
        });
        return;
      }

      // Parse floor number and optional name. Accept any integer or string layout: e.g., Ground, First, Floor 1, 10
      let floorNum = 0;
      let floorName = '';
      
      // Priority 1: Read explicit statistical Floor Number column
      if (floorNumberRaw !== undefined && floorNumberRaw !== null && floorNumberRaw !== '') {
        const parsedFloorNumber = parseInt(String(floorNumberRaw).trim(), 10);
        if (!isNaN(parsedFloorNumber)) {
          floorNum = parsedFloorNumber;
        }
      }
      
      // Determine descriptive Name/Representation of the floor
      const baseFloorRaw = floorRaw !== undefined && floorRaw !== null && floorRaw !== '' ? floorRaw : floorNumberRaw;
      const parsedFloorNumberFromBase = parseInt(String(baseFloorRaw).replace(/[^\d]/g, ''), 10);
      
      if (floorNumberRaw === undefined || floorNumberRaw === null || floorNumberRaw === '') {
        // If no explicit "Floor Number" column was passed, parse it from the "Floor" column
        if (!isNaN(parsedFloorNumberFromBase)) {
          floorNum = parsedFloorNumberFromBase;
          floorName = String(baseFloorRaw).trim();
        } else {
          // Fallback checks for word/string representations of floors
          const normalizedFloorStr = String(baseFloorRaw).toLowerCase().trim();
          if (normalizedFloorStr.includes('ground') || normalizedFloorStr.includes('ارضي') || normalizedFloorStr.includes('أرضي')) {
            floorNum = 0;
            floorName = String(baseFloorRaw).trim();
          } else if (normalizedFloorStr.includes('first') || normalizedFloorStr.includes('اول') || normalizedFloorStr.includes('أول')) {
            floorNum = 1;
            floorName = String(baseFloorRaw).trim();
          } else if (normalizedFloorStr.includes('second') || normalizedFloorStr.includes('ثاني') || normalizedFloorStr.includes('ثانى')) {
            floorNum = 2;
            floorName = String(baseFloorRaw).trim();
          } else if (normalizedFloorStr.includes('third') || normalizedFloorStr.includes('ثالث')) {
            floorNum = 3;
            floorName = String(baseFloorRaw).trim();
          } else if (normalizedFloorStr.includes('fourth') || normalizedFloorStr.includes('رابع')) {
            floorNum = 4;
            floorName = String(baseFloorRaw).trim();
          } else if (normalizedFloorStr.includes('fifth') || normalizedFloorStr.includes('خامس')) {
            floorNum = 5;
            floorName = String(baseFloorRaw).trim();
          } else {
            floorNum = 0;
            floorName = String(baseFloorRaw).trim();
          }
        }
      } else {
        // We have an explicit floor number. Read descriptive name from the floor column.
        floorName = floorRaw !== undefined && floorRaw !== null && floorRaw !== '' ? String(floorRaw).trim() : `Floor ${floorNum}`;
      }

      if (!floorName) {
        floorName = `Floor ${floorNum}`;
      }

      // Parse room name or number - accepts any string or integer completely
      const roomNumStr = String(roomNumberRaw).trim();

      // Clean bed count inputs to support empty cells / blank values seamlessly
      let individualBeds = 0;
      if (individualBedsRaw !== undefined && individualBedsRaw !== null && String(individualBedsRaw).trim() !== '') {
        individualBeds = parseInt(String(individualBedsRaw).trim(), 10);
      }

      let bunkBeds = 0;
      if (bunkBedsRaw !== undefined && bunkBedsRaw !== null && String(bunkBedsRaw).trim() !== '') {
        bunkBeds = parseInt(String(bunkBedsRaw).trim(), 10);
      }

      let kingBeds = 0;
      if (kingBedsRaw !== undefined && kingBedsRaw !== null && String(kingBedsRaw).trim() !== '') {
        kingBeds = parseInt(String(kingBedsRaw).trim(), 10);
      }

      if (isNaN(individualBeds) || individualBeds < 0) {
        errors.push({
          row: rowNumber,
          field: 'individualBeds',
          value: individualBedsRaw,
          message: 'Individual Beds must be a non-negative integer',
        });
        return;
      }

      if (isNaN(bunkBeds) || bunkBeds < 0) {
        errors.push({
          row: rowNumber,
          field: 'bunkBeds',
          value: bunkBedsRaw,
          message: 'Bunk Beds must be a non-negative integer',
        });
        return;
      }

      if (isNaN(kingBeds) || kingBeds < 0) {
        errors.push({
          row: rowNumber,
          field: 'kingBeds',
          value: kingBedsRaw,
          message: 'King Beds must be a non-negative integer',
        });
        return;
      }

      if (individualBeds === 0 && bunkBeds === 0 && kingBeds === 0) {
        errors.push({
          row: rowNumber,
          field: 'capacity',
          value: 0,
          message: 'Room must have at least one individual, bunk, or king bed',
        });
        return;
      }

      data.push({
        building: String(buildingRaw).trim(),
        floorValue: floorName, // pass floorName which describes the string/int representation
        roomNumber: roomNumStr,
        individualBeds,
        bunkBeds,
        kingBeds,
      });
    });

    return { data, errors };
  }

  /**
   * Generate excel file from rooms data
   * WHY: Export rooms layout to Excel format
   */
  generateRoomsExcel(rooms: any[]): Buffer {
    const excelData = rooms.map(room => ({
      'Building': room.floor?.building?.name || '',
      'Floor': room.floor?.floorNumber !== undefined ? room.floor.floorNumber : '',
      'Room': room.roomNumber || '',
      'Individual Beds': room.individualBeds || 0,
      'Bunk Beds': room.bunkBeds || 0,
      'King Beds': room.kingBeds || 0,
      'Capacity': room.capacity || 0,
      'Room Type': room.roomType || 'GENERAL',
      'Amenities': room.amenities || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rooms');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 20 }, // Building
      { wch: 10 }, // Floor
      { wch: 15 }, // Room
      { wch: 18 }, // Individual Beds
      { wch: 15 }, // Bunk Beds
      { wch: 15 }, // King Beds
      { wch: 12 }, // Capacity
      { wch: 15 }, // Room Type
      { wch: 40 }, // Amenities
    ];

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /**
   * Generate Excel template for room import
   * WHY: Provide users with a template for rooms import
   */
  generateRoomTemplate(): Buffer {
    const templateData = [
      {
        'Building': 'Building A',
        'Floor': 1,
        'Room': '101',
        'Individual Beds': 2,
        'Bunk Beds': 1,
        'King Beds': 0,
      },
      {
        'Building': 'Building A',
        'Floor': 1,
        'Room': '102',
        'Individual Beds': 4,
        'Bunk Beds': 0,
        'King Beds': 0,
      },
      {
        'Building': 'Building B',
        'Floor': 2,
        'Room': '201',
        'Individual Beds': 0,
        'Bunk Beds': 3,
        'King Beds': 0,
      },
      {
        'Building': 'Building B',
        'Floor': 2,
        'Room': '202',
        'Individual Beds': 0,
        'Bunk Beds': 0,
        'King Beds': 1,
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rooms');

    worksheet['!cols'] = [
      { wch: 20 }, // Building
      { wch: 10 }, // Floor
      { wch: 15 }, // Room
      { wch: 20 }, // Individual Beds
      { wch: 15 }, // Bunk Beds
      { wch: 15 }, // King Beds
    ];

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
