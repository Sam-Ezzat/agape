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
    },
    documentation: 'See README.md for API documentation',
  });
});

export default router;
