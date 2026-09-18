/**
 * Search Controller
 * 
 * WHY: HTTP layer for search operations
 * Exposes dual-language search utilities
 */

import { Request, Response } from 'express';
import { SearchDualLanguageService } from '@/search/dual-language';

export class SearchController {
  private searchService: SearchDualLanguageService;

  constructor() {
    this.searchService = new SearchDualLanguageService();
  }

  /**
   * POST /api/search/generate-candidates
   * Generate search candidates for a query (for client-side filtering)
   */
  async generateCandidates(req: Request, res: Response) {
    const { query } = req.body;
    
    if (!query || typeof query !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Query is required',
      });
      return;
    }

    const candidates = this.searchService.generateSearchCandidates(query);
    
    res.json({
      success: true,
      data: {
        query,
        candidates,
      },
    });
  }
}
