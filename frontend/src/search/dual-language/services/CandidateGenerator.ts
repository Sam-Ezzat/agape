import { Language } from '../models/Language';
import { DictionaryService } from './DictionaryService';
import { Transliterator } from './Transliterator';
import { NameSplitter } from './NameSplitter';
import { NameNormalizer } from './NameNormalizer';

/**
 * Generates all possible search candidates for a name
 */
export class CandidateGenerator {
  private dictionaryService: DictionaryService;
  private transliterator: Transliterator;
  private nameSplitter: NameSplitter;
  private normalizer: NameNormalizer;

  constructor() {
    this.dictionaryService = new DictionaryService();
    this.transliterator = new Transliterator();
    this.nameSplitter = new NameSplitter();
    this.normalizer = new NameNormalizer();
  }

  /**
   * Generate all candidate variations for a search query
   */
  generateCandidates(query: string, language: Language): string[] {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const candidates = new Set<string>();

    // Add original query
    candidates.add(query);

    // Add normalized version
    const normalized = this.normalizer.normalize(query, language);
    candidates.add(normalized);

    // Split name into parts
    const parts = this.nameSplitter.split(normalized);

    // Process each part
    for (const part of parts) {
      // Add the part itself
      candidates.add(part);

      // Try dictionary lookup first (more accurate)
      const dictionaryTranslations = this.dictionaryService.getTranslations(part);
      dictionaryTranslations.forEach(t => candidates.add(t));

      // If not in dictionary, use rule-based transliteration
      if (dictionaryTranslations.length === 0) {
        const transliterations = this.transliterator.transliterate(part, language);
        transliterations.forEach(t => candidates.add(t));
      }

      // Generate spelling variations
      const spellingVariations = this.transliterator.generateSpellingVariations(part);
      spellingVariations.forEach(v => candidates.add(v));
    }

    // If multi-part name, also try full name translations
    if (parts.length > 1) {
      const fullName = parts.join(' ');
      const fullTranslations = this.dictionaryService.getTranslations(fullName);
      fullTranslations.forEach(t => candidates.add(t));

      const fullTransliterations = this.transliterator.transliterate(fullName, language);
      fullTransliterations.forEach(t => candidates.add(t));
    }

    // Add spacing variations (e.g., عبد الرحمن <-> عبدالرحمن)
    const spacingVariations = this.nameSplitter.generateSpacingVariations(normalized);
    spacingVariations.forEach(v => candidates.add(v));

    // For Arabic compound names, add transliterations of spacing variations
    if (language === Language.ARABIC) {
      for (const variation of spacingVariations) {
        const transliterations = this.transliterator.transliterate(variation, language);
        transliterations.forEach(t => {
          candidates.add(t);
          // Also add variations of the transliteration
          const spacingVars = this.nameSplitter.generateSpacingVariations(t);
          spacingVars.forEach(sv => candidates.add(sv));
        });
      }
    }

    // Remove empty strings and normalize
    const filtered = Array.from(candidates)
      .filter(c => c && c.trim().length > 0)
      .map(c => c.trim());

    // Remove duplicates (case-insensitive for English)
    const unique = Array.from(new Set(filtered));

    return unique;
  }

  /**
   * Generate candidates for full name (handles multiple words)
   */
  generateFullNameCandidates(fullName: string, language: Language): string[] {
    const candidates = new Set<string>();

    // Add original
    candidates.add(fullName);

    // Generate candidates for the full name
    const fullCandidates = this.generateCandidates(fullName, language);
    fullCandidates.forEach(c => candidates.add(c));

    // Split and process each word
    const words = fullName.split(/\s+/);
    if (words.length > 1) {
      // Generate candidates for each word
      const wordCandidates = words.map(word => 
        this.generateCandidates(word, language)
      );

      // Combine word candidates in different ways
      // Example: ["Mohamed", "محمد"] + ["Ahmed", "أحمد"] 
      // -> ["Mohamed Ahmed", "محمد أحمد", "Mohamed أحمد", etc.]
      this.combineWordCandidates(wordCandidates).forEach(c => candidates.add(c));
    }

    return Array.from(candidates).filter(c => c && c.trim().length > 0);
  }

  /**
   * Combine word candidates to form full name variations
   */
  private combineWordCandidates(wordCandidates: string[][]): string[] {
    if (wordCandidates.length === 0) return [];
    if (wordCandidates.length === 1) return wordCandidates[0]!;

    const combinations: string[] = [];
    
    // Limit combinations to prevent explosion
    const maxCombinations = 50;
    let count = 0;

    const generate = (index: number, current: string[]) => {
      if (count >= maxCombinations) return;
      
      if (index === wordCandidates.length) {
        combinations.push(current.join(' '));
        count++;
        return;
      }

      for (const candidate of wordCandidates[index]!.slice(0, 3)) { // Limit to 3 per word
        generate(index + 1, [...current, candidate]);
        if (count >= maxCombinations) break;
      }
    };

    generate(0, []);
    return combinations;
  }
}
