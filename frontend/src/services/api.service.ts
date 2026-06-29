/**
 * API Service
 * 
 * WHY: Centralized HTTP client for backend API communication
 * Uses axios for all HTTP requests with consistent error handling
 * 
 * IMPORTANT: All endpoints match backend routes exactly
 * Backend base URL: http://localhost:3000/api
 */

import axios, { AxiosError } from 'axios';
import { toastError } from './toast.service';
import type {
  Attendee,
  RoomAssignment,
  AuditLog,
  DashboardStats,
  OccupancyBreakdown,
  PaginatedResponse,
  ApiResponse,
  AttendeeFilters,
  AssignmentFilters,
  AuditLogFilters,
  CreateAttendeeDTO,
  UpdateAttendeeDTO,
  CreateAssignmentDTO,
  BatchAssignmentDTO,
} from '@/types/api';

// WHY: Single source of truth for API base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// WHY: Axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// WHY: Centralized error handling
const handleApiError = (error: AxiosError | Error) => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message || error.message || 'An error occurred';
    toastError(message);
    throw new Error(message);
  }
  toastError(error.message);
  throw error;
};

/**
 * Attendee API
 * Backend routes: /api/attendees
 */
export const attendeeApi = {
  /**
   * GET /api/attendees
   * List attendees with pagination and filters
   */
  list: async (filters?: AttendeeFilters): Promise<PaginatedResponse<Attendee>> => {
    try {
      const { data } = await apiClient.get('/attendees', { params: filters });
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * GET /api/attendees/:id
   * Get single attendee by ID
   */
  getById: async (id: string): Promise<ApiResponse<Attendee>> => {
    try {
      const { data } = await apiClient.get(`/attendees/${id}`);
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * GET /api/attendees/:id/details
   * Get attendee with full assignment details (room, floor, building, etc.)
   */
  getDetails: async (id: string): Promise<ApiResponse<Attendee>> => {
    try {
      const { data } = await apiClient.get(`/attendees/${id}/details`);
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * GET /api/attendees/unassigned
   * Get attendees without room assignment
   */
  getUnassigned: async (): Promise<ApiResponse<Attendee[]>> => {
    try {
      const { data } = await apiClient.get('/attendees/unassigned');
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * GET /api/attendees/stats
   * Get attendee statistics
   */
  getStats: async (): Promise<ApiResponse<any>> => {
    try {
      const { data } = await apiClient.get('/attendees/stats');
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * POST /api/attendees
   * Create new attendee
   */
  create: async (dto: CreateAttendeeDTO): Promise<ApiResponse<Attendee>> => {
    try {
      const { data } = await apiClient.post('/attendees', dto);
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * PATCH /api/attendees/:id
   * Update attendee
   */
  update: async (id: string, dto: UpdateAttendeeDTO): Promise<ApiResponse<Attendee>> => {
    try {
      const { data } = await apiClient.patch(`/attendees/${id}`, dto);
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * DELETE /api/attendees/:id
   * Delete attendee (soft delete)
   */
  delete: async (id: string): Promise<ApiResponse<Attendee>> => {
    try {
      const { data } = await apiClient.delete(`/attendees/${id}`);
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * POST /api/attendees/:id/check-in
   * Check in attendee
   */
  checkIn: async (id: string): Promise<ApiResponse<Attendee>> => {
    try {
      const { data } = await apiClient.post(`/attendees/${id}/check-in`);
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * POST /api/attendees/:id/check-out
   * Check out attendee
   */
  checkOut: async (id: string): Promise<ApiResponse<Attendee>> => {
    try {
      const { data } = await apiClient.post(`/attendees/${id}/check-out`);
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },
};

/**
 * Assignment API
 * Backend routes: /api/assignments
 */
export const assignmentApi = {
  /**
   * GET /api/assignments
   * List assignments with filters
   */
  list: async (filters?: AssignmentFilters): Promise<PaginatedResponse<RoomAssignment>> => {
    try {
      const { data } = await apiClient.get('/assignments', { params: filters });
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * GET /api/assignments/:id
   * Get single assignment
   */
  getById: async (id: string): Promise<ApiResponse<RoomAssignment>> => {
    try {
      const { data } = await apiClient.get(`/assignments/${id}`);
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * POST /api/assignments
   * Create new assignment
   */
  create: async (dto: CreateAssignmentDTO): Promise<ApiResponse<RoomAssignment>> => {
    try {
      const { data } = await apiClient.post('/assignments', dto);
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * POST /api/assignments/batch
   * Batch assign multiple attendees
   */
  batchAssign: async (dto: BatchAssignmentDTO): Promise<ApiResponse<any>> => {
    try {
      const { data } = await apiClient.post('/assignments/batch', dto);
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * DELETE /api/assignments/:id
   * Delete assignment (unassign)
   */
  delete: async (id: string): Promise<ApiResponse<RoomAssignment>> => {
    try {
      const { data } = await apiClient.delete(`/assignments/${id}`);
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },
};

/**
 * Dashboard API
 * Backend routes: /api/dashboard
 */
export const dashboardApi = {
  /**
   * GET /api/dashboard/stats
   * Get overall system statistics
   */
  getStats: async (): Promise<ApiResponse<DashboardStats>> => {
    try {
      const { data } = await apiClient.get('/dashboard/stats');
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * GET /api/dashboard/occupancy
   * Get occupancy breakdown by building/floor
   */
  getOccupancy: async (): Promise<ApiResponse<OccupancyBreakdown[]>> => {
    try {
      const { data } = await apiClient.get('/dashboard/occupancy');
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * GET /api/dashboard/recent-activity
   * Get recent system activity
   */
  getRecentActivity: async (limit = 20): Promise<ApiResponse<AuditLog[]>> => {
    try {
      const { data } = await apiClient.get('/dashboard/recent-activity', { params: { limit } });
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * GET /api/dashboard/check-ins
   * Get check-in/check-out report
   */
  getCheckInReport: async (): Promise<ApiResponse<any>> => {
    try {
      const { data } = await apiClient.get('/dashboard/check-ins');
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },
};

/**
 * Audit Log API
 * Backend routes: /api/audit-logs
 */
export const auditLogApi = {
  /**
   * GET /api/audit-logs
   * List audit logs with filters
   */
  list: async (filters?: AuditLogFilters): Promise<PaginatedResponse<AuditLog>> => {
    try {
      const { data } = await apiClient.get('/audit-logs', { params: filters });
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * GET /api/audit-logs/recent
   * Get recent activity
   */
  getRecent: async (limit = 20): Promise<ApiResponse<AuditLog[]>> => {
    try {
      const { data } = await apiClient.get('/audit-logs/recent', { params: { limit } });
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * GET /api/audit-logs/stats
   * Get audit statistics
   */
  getStats: async (): Promise<ApiResponse<any>> => {
    try {
      const { data } = await apiClient.get('/audit-logs/stats');
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },
};

/**
 * Excel API
 * Backend routes: /api/excel
 */
export const excelApi = {
  /**
   * GET /api/excel/attendees/template
   * Download Excel template for attendee import
   */
  downloadTemplate: async (): Promise<Blob> => {
    try {
      const { data } = await apiClient.get('/excel/attendees/template', {
        responseType: 'blob',
      });
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * POST /api/excel/attendees/import
   * Import attendees from Excel file
   */
  importAttendees: async (file: File): Promise<ApiResponse<any>> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await apiClient.post('/excel/attendees/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * GET /api/excel/attendees/export
   * Export attendees to Excel
   */
  exportAttendees: async (filters?: AttendeeFilters): Promise<Blob> => {
    try {
      const { data } = await apiClient.get('/excel/attendees/export', {
        params: filters,
        responseType: 'blob',
      });
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },

  /**
   * GET /api/excel/assignments/export
   * Export room assignments to Excel
   */
  exportAssignments: async (filters?: AssignmentFilters): Promise<Blob> => {
    try {
      const { data } = await apiClient.get('/excel/assignments/export', {
        params: filters,
        responseType: 'blob',
      });
      return data;
    } catch (error) {
      return handleApiError(error as Error);
    }
  },
};

export default apiClient;
