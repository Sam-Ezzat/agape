/**
 * TypeScript Type Definitions
 * 
 * WHY: Centralized type definitions shared across the frontend
 * Ensures type consistency with backend API responses
 * 
 * SOLID Principle: Interface Segregation - Separate interfaces for each domain
 */

/**
 * Conference Role Enum
 * WHY: Must match backend enum for consistency
 */
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

/**
 * Gender Enum
 * WHY: Match backend enum
 */
export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

/**
 * Room Type Enum
 * WHY: Match backend enum
 */
export enum RoomType {
  SINGLE = 'SINGLE',
  DOUBLE = 'DOUBLE',
  SUITE = 'SUITE',
  DORMITORY = 'DORMITORY',
}

/**
 * Attendee Interface
 * WHY: Complete attendee profile with all fields from backend
 */
export interface Attendee {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  age?: number;
  gender?: Gender;
  churchOrg?: string;
  conferenceRole: ConferenceRole;
  notes?: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  assignment?: RoomAssignment;
}

/**
 * Conference House Interface
 * WHY: Top-level entity in the hierarchy
 */
export interface ConferenceHouse {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  buildings?: Building[];
}

/**
 * Building Interface
 * WHY: Buildings within a conference house
 */
export interface Building {
  id: string;
  conferenceHouseId: string;
  name: string;
  floorCount: number;
  createdAt: string;
  updatedAt: string;
  floors?: Floor[];
}

/**
 * Floor Interface
 * WHY: Floors within a building
 */
export interface Floor {
  id: string;
  buildingId: string;
  floorNumber: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  rooms?: Room[];
}

/**
 * Room Interface
 * WHY: Individual rooms where attendees are assigned
 */
export interface Room {
  id: string;
  floorId: string;
  roomNumber: string;
  capacity: number;
  roomType: RoomType;
  amenities?: string[];
  createdAt: string;
  updatedAt: string;
  assignments?: RoomAssignment[];
  // WHY: Computed field for UI display
  occupancy?: number;
}

/**
 * Room Assignment Interface
 * WHY: Links attendees to rooms
 */
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

/**
 * Audit Log Interface
 * WHY: Track all changes for accountability
 */
export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
  performedBy?: string;
  createdAt: string;
}

/**
 * API Response Wrapper
 * WHY: Consistent response format from backend
 */
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

/**
 * API Error Response
 * WHY: Consistent error format from backend
 */
export interface ApiError {
  status: 'error';
  statusCode: number;
  message: string;
  errors?: Array<{ field: string; message: string }>;
}

/**
 * Pagination Response
 * WHY: For paginated lists (attendees, rooms, etc.)
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Search/Filter Parameters
 * WHY: Query parameters for search and filter operations
 */
export interface SearchParams {
  query?: string;
  role?: ConferenceRole;
  gender?: Gender;
  buildingId?: string;
  floorId?: string;
  assigned?: boolean;
  checkedIn?: boolean;
  page?: number;
  limit?: number;
}
