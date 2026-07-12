/**
 * Search Routes
 * 
 * WHY: Expose search utilities via REST API
 */

import { Router } from 'express';
import { SearchController } from '@/controllers/search.controller';
import { asyncHandler } from '@/middleware/asyncHandler';

const router = Router();
const searchController = new SearchController();

/**
 * @route   POST /api/search/generate-candidates
 * @desc    Generate search candidates for a query (dual-language support)
 * @access  Public
 */
router.post(
  '/generate-candidates',
  asyncHandler(searchController.generateCandidates.bind(searchController))
);

export default router;
