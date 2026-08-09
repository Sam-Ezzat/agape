import { Language } from '../models/Language';
import { SearchResult } from '../models/SearchResult';
import { LanguageDetector } from './LanguageDetector';
import { NameNormalizer } from './NameNormalizer';
import { CandidateGenerator } from './CandidateGenerator';
import { SimilarityService } from './SimilarityService';

/**
 * Main orchestrator for dual-language search
 * Coordinates all services to perform cross-language name search
 */
export class SearchDualLanguageService {
  private languageDetector: LanguageDetector;
  private normalizer: NameNormalizer;
  private candidateGenerator: CandidateGenerator;
  private similarityService: SimilarityService;

  constructor() {
    this.languageDetector = new LanguageDetector();
    this.normalizer = new NameNormalizer();
    this.candidateGenerator = new CandidateGenerator();
    this.similarityService = new SimilarityService();
  }

  /**
   * Generate all search candidates for a query
   * This is the main entry point for generating database search terms
   */
  generateSearchCandidates(query: string): string[] {
    if (!query || query.trim().length === 0) {
      return [];
    }

    // Detect language
    const language = this.languageDetector.detectPrimary(query);

    // Normalize query
    const normalized = this.normalizer.normalize(query, language);

    // Generate candidates
    const candidates = this.candidateGenerator.generateFullNameCandidates(normalized, language);

    return candidates;
  }

  /**
   * Search and rank results by similarity
   * Use this when you have a list of names to search through
   */
  searchWithScoring<T>(
    query: string,
    items: T[],
    extractName: (item: T) => string
  ): SearchResult<T>[] {
    if (!query || query.trim().length === 0) {
      return items.map(item => ({
        item,
        score: 100,
        matchedTerm: extractName(item),
        originalQuery: query
      }));
    }

    // Generate candidates for the query
    const candidates = this.generateSearchCandidates(query);

    // Score each item against all candidates
    const results: SearchResult<T>[] = [];

    for (const item of items) {
      const itemName = extractName(item);
      let bestScore = 0;
      let bestMatch = itemName;

      // Check similarity against all candidates
      for (const candidate of candidates) {
        const score = this.similarityService.calculateSimilarity(candidate, itemName);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = candidate;
        }
      }

      // Also check direct similarity with original query
      const directScore = this.similarityService.calculateSimilarity(query, itemName);
      if (directScore > bestScore) {
        bestScore = directScore;
        bestMatch = query;
      }

      if (bestScore >= this.similarityService.getThreshold()) {
        results.push({
          item,
          score: bestScore,
          matchedTerm: bestMatch,
          originalQuery: query
        });
      }
    }

    // Sort by score descending
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Simple search that returns just the candidates (for SQL queries)
   */
  search(query: string): string[] {
    return this.generateSearchCandidates(query);
  }

  /**
   * Set the similarity threshold (0-100)
   */
  setThreshold(threshold: number): void {
    this.similarityService.setThreshold(threshold);
  }

  /**
   * Get the current similarity threshold
   */
  getThreshold(): number {
    return this.similarityService.getThreshold();
  }

  /**
   * Detect the language of input text
   */
  detectLanguage(text: string): Language {
    return this.languageDetector.detectPrimary(text);
  }
}
