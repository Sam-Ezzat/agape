import { StringHelper } from '../utils/StringHelper';
import { ScoredResult } from '../models/SearchResult';

/**
 * Calculates similarity scores between strings
 */
export class SimilarityService {
  private defaultThreshold = 70; // 70% similarity threshold

  /**
   * Calculate similarity score between two strings (0-100)
   */
  calculateSimilarity(str1: string, str2: string): number {
    return StringHelper.calculateSimilarity(str1, str2);
  }

  /**
   * Score a list of candidates against a query
   */
  scoreResults(query: string, candidates: string[]): ScoredResult[] {
    const normalizedQuery = query.toLowerCase().trim();
    
    const scored = candidates.map(candidate => ({
      value: candidate,
      score: this.calculateSimilarity(normalizedQuery, candidate.toLowerCase())
    }));

    // Sort by score descending
    return scored
      .filter(s => s.score >= this.defaultThreshold)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Find best matches from a list of items
   */
  findBestMatches<T>(
    query: string,
    items: T[],
    extractText: (item: T) => string,
    threshold: number = this.defaultThreshold
  ): Array<{ item: T; score: number }> {
    const normalizedQuery = query.toLowerCase().trim();

    const scored = items.map(item => {
      const text = extractText(item).toLowerCase().trim();
      const score = this.calculateSimilarity(normalizedQuery, text);
      return { item, score };
    });

    return scored
      .filter(s => s.score >= threshold)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Check if two strings are similar enough
   */
  areSimilar(str1: string, str2: string, threshold: number = this.defaultThreshold): boolean {
    const score = this.calculateSimilarity(str1, str2);
    return score >= threshold;
  }

  /**
   * Set the similarity threshold
   */
  setThreshold(threshold: number): void {
    this.defaultThreshold = Math.max(0, Math.min(100, threshold));
  }

  /**
   * Get current threshold
   */
  getThreshold(): number {
    return this.defaultThreshold;
  }
}
