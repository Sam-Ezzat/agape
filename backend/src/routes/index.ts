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

const router = Router();

// Mount routes with /api prefix
router.use('/conference-houses', conferenceHouseRoutes);
router.use('/buildings', buildingRoutes);
router.use('/floors', floorRoutes);
router.use('/rooms', roomRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Agape Conference Management API',
    version: '1.0.0',
    endpoints: {
      conferenceHouses: '/api/conference-houses',
      buildings: '/api/buildings',
      floors: '/api/floors',
      rooms: '/api/rooms',
    },
    documentation: 'See README.md for API documentation',
  });
});

export default router;
