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
  SINGLE = 'SINGLE',
  DOUBLE = 'DOUBLE',
  SUITE = 'SUITE',
  DORMITORY = 'DORMITORY',
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
  roomType: RoomType;
  amenities?: any;
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
  arrivalMethod?: string;
  busPickupPoint?: string;
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
