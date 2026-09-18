/**
 * Search Dual Languages Engine (SDLE)
 * Main export file for the dual-language search module
 */

// Main service
export { SearchDualLanguageService } from './services/SearchDualLanguageService';

// Models
export { Language } from './models/Language';
export type { SearchCandidate } from './models/SearchCandidate';
export type { SearchResult, ScoredResult } from './models/SearchResult';

// Services (for advanced usage)
export { LanguageDetector } from './services/LanguageDetector';
export { NameNormalizer } from './services/NameNormalizer';
export { NameSplitter } from './services/NameSplitter';
export { DictionaryService } from './services/DictionaryService';
export { Transliterator } from './services/Transliterator';
export { CandidateGenerator } from './services/CandidateGenerator';
export { SimilarityService } from './services/SimilarityService';

// Utilities
export { StringHelper } from './utils/StringHelper';
