/**
 * API Types
 * 
 * WHY: TypeScript interfaces matching backend Prisma models
 * Ensures type safety when calling backend API
 */

// Enums matching backend
export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export enum ConferenceRole {
  LEADER = 'LEADER',
  PASTOR = 'PASTOR',
  VIP = 'VIP',
  ATTENDEE = 'ATTENDEE',
  EXCEPTION = 'EXCEPTION',
  STAFF = 'STAFF',
  VOLUNTEER = 'VOLUNTEER',
  OTHER = 'OTHER',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
}

export enum RoomType {
  GENERAL = 'GENERAL',
  VIP = 'VIP',
  FAMILY = 'FAMILY',
}

// Core entities matching Prisma schema
export interface ConferenceHouse {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  buildings?: Building[];
}

export interface Building {
  id: string;
  conferenceHouseId: string;
  name: string;
  floorCount: number;
  createdAt: string;
  updatedAt: string;
  conferenceHouse?: ConferenceHouse;
  floors?: Floor[];
}

export interface Floor {
  id: string;
  buildingId: string;
  floorNumber: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  building?: Building;
  rooms?: Room[];
}

export interface Room {
  id: string;
  floorId: string;
  roomNumber: string;
  capacity: number;
  individualBeds: number;
  bunkBeds: number;
  kingBeds: number;
  roomType: RoomType;
  amenities?: string;
  createdAt: string;
  updatedAt: string;
  floor?: Floor;
  assignments?: RoomAssignment[];
}

export interface Attendee {
  id: string;
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
  paymentStatus?: PaymentStatus;
  transactionNumber?: string;
  conferenceRole: ConferenceRole;
  notes?: string;
  roomingNotes?: string;
  internalNotes?: string;
  checkedInAt?: string;
  checkedInBy?: string;
  checkedOutAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  assignment?: RoomAssignment;
}

export interface RoomAssignment {
  id: string;
  roomId: string;
  attendeeId: string;
  assignedAt: string;
  assignedBy?: string;
  createdAt: string;
  updatedAt: string;
  room?: Room;
  attendee?: Attendee;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: any;
  performedBy?: string;
  createdAt: string;
}

// API request/response types
export interface PaginationParams {
  page?: string;
  limit?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// Dashboard types
export interface DashboardStats {
  attendees: {
    total: number;
    checkedIn: number;
    withAssignment: number;
    byRole: Record<string, number>;
  };
  rooms: {
    total: number;
    occupied: number;
    available: number;
    occupancyRate: number;
  };
  assignments: {
    total: number;
    today: number;
  };
  activity: {
    totalActions: number;
    byAction: Record<string, number>;
  };
}

export interface OccupancyBreakdown {
  id: string;
  name: string;
  buildings: {
    id: string;
    name: string;
    floors: {
      id: string;
      floorNumber: number;
      name: string;
      roomCount: number;
      capacity: number;
      occupied: number;
      available: number;
      occupancyRate: string;
    }[];
  }[];
}

// Filter types
export interface AttendeeFilters extends PaginationParams {
  search?: string;
  role?: ConferenceRole;
  gender?: Gender;
  checkedIn?: 'true' | 'false';
  hasAssignment?: 'true' | 'false';
  dualSearch?: 'true' | 'false'; // Dual-language search (Arabic ↔ English)
  onlyDeleted?: 'true' | 'false';
}

export interface UnassignedFilters {
  search?: string;
  dualSearch?: 'true' | 'false'; // Dual-language search (Arabic ↔ English)
}

export interface RoomFilters extends PaginationParams {
  floorId?: string;
  available?: 'true' | 'false';
  roomType?: RoomType;
  minCapacity?: string;
}

export interface AssignmentFilters extends PaginationParams {
  roomId?: string;
  buildingId?: string;
  floorId?: string;
}

export interface AuditLogFilters extends PaginationParams {
  action?: string;
  entityType?: string;
  entityId?: string;
  startDate?: string;
  endDate?: string;
}

// Create/Update DTOs
export interface CreateAttendeeDTO {
  fullName: string;
  phone?: string;
  email?: string;
  age?: number;
  gender?: Gender;
  churchOrg?: string;
  conferenceRole?: ConferenceRole;
  notes?: string;
}

export interface UpdateAttendeeDTO extends Partial<CreateAttendeeDTO> {}

export interface CreateAssignmentDTO {
  roomId: string;
  attendeeId: string;
  assignedBy?: string;
  notes?: string;
}

export interface BatchAssignmentDTO {
  assignments: CreateAssignmentDTO[];
}

// Auto-Assignment types
export interface AutoAssignmentConfig {
  id: string;
  conferenceHouseId: string;
  enabledBuildings?: string[];
  buildingGenderOverrides?: Record<string, 'MALE' | 'FEMALE'>;
  staffReservedCapacity?: number;
  ruleWeights?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface RunAutoAssignmentDTO {
  conferenceHouseId: string;
  buildingIds?: string[];
  buildingGenderOverrides?: Record<string, 'MALE' | 'FEMALE'>;
  dryRun?: boolean;
  options?: {
    minGroupSize?: number;
    preserveExistingAssignments?: boolean;
  };
}

export interface UpdateAutoAssignmentConfigDTO {
  enabledBuildings?: string[];
  buildingGenderOverrides?: Record<string, 'MALE' | 'FEMALE'>;
  staffReservedCapacity?: number;
  ruleWeights?: Record<string, number>;
}

export interface AssignmentPreview {
  attendeeId: string;
  attendeeName: string;
  gender?: string;                     // Attendee gender for display
  age?: number;                        // Attendee age for display
  roomId: string;
  roomNumber: string;
  buildingName: string;
  floorNumber: number;
  roomCapacity?: number;              // Room capacity for availability calculations
  score: number;
  appliedRules: string[];
  reason?: string;                    // Explanation of why this assignment was made
  scoreBreakdown?: Record<string, number>; // Score contribution by each rule
  groupInfo?: {                       // Group membership information
    groupId: string;
    groupType: 'roommate' | 'family' | 'church' | 'governorate' | 'individual';
    groupSize: number;
    roommatesInSameRoom?: number;      // How many roommates assigned to this room
  };
  warnings?: string[];                 // Non-critical issues
}

export interface AutoAssignmentExecutionResult {
  success: boolean;
  assignmentsCreated: number;
  roomsUsed: number;
  attendeesProcessed: number;
  unassignedAttendees: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
  validationErrors: Array<{
    attendeeId: string;
    reason: string;
  }>;
  assignments?: AssignmentPreview[];  // Preview of all assignments
  executionTimeMs: number;
  stages: Record<string, {
    duration: number;
    success: boolean;
  }>;
}

export interface AutoAssignmentStatus {
  totalAttendees: number;
  assignedAttendees: number;
  unassignedAttendees: number;
  totalRooms: number;
  availableRooms: number;
  occupancyRate: number;
}
