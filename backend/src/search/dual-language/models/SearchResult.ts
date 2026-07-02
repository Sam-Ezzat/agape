/**
 * Search result with similarity scoring
 */
export interface SearchResult<T = any> {
  item: T;
  score: number;
  matchedTerm: string;
  originalQuery: string;
}

/**
 * Scored result for internal ranking
 */
export interface ScoredResult {
  value: string;
  score: number;
}
