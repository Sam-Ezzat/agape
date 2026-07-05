/**
 * Main Routes Index
 * 
 * WHY: Centralized route registration
 * Imports all route modules and mounts them with API prefix
 */

import { Router } from 'express';
import conferenceHouseRoutes from './conferenceHouse.routes';
import buildingRoutes from './building.routes';
import floorRoutes from './floor.routes';
import roomRoutes from './room.routes';
import attendeeRoutes from './attendee.routes';
import assignmentRoutes from './assignment.routes';
import auditLogRoutes from './auditLog.routes';
import dashboardRoutes from './dashboard.routes';
import excelRoutes from './excel.routes';
import autoAssignmentRoutes from './autoAssignment.routes';

const router = Router();

// Mount routes with /api prefix

// Phase 2: Core Infrastructure Routes
router.use('/conference-houses', conferenceHouseRoutes);
router.use('/buildings', buildingRoutes);
router.use('/floors', floorRoutes);
router.use('/rooms', roomRoutes);

// Phase 3: Attendee & Assignment Routes
router.use('/attendees', attendeeRoutes);
router.use('/assignments', assignmentRoutes);

// Phase 4: Audit, Monitoring & Excel Routes
router.use('/audit-logs', auditLogRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/excel', excelRoutes);

// Phase 4: Auto-Assignment Routes
router.use('/auto-assignment', autoAssignmentRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Agape Conference Management API',
    version: '1.0.0',
    endpoints: {
      // Phase 2: Core Infrastructure
      conferenceHouses: '/api/conference-houses',
      buildings: '/api/buildings',
      floors: '/api/floors',
      rooms: '/api/rooms',
      // Phase 3: Attendee Management
      attendees: '/api/attendees',
      assignments: '/api/assignments',
      // Phase 4: Audit, Monitoring & Excel
      auditLogs: '/api/audit-logs',
      dashboard: '/api/dashboard',
      excel: '/api/excel',
      autoAssignment: '/api/auto-assignment',
    },
    documentation: 'See README.md for API documentation',
  });
});

export default router;
