import { NameNormalizer } from './NameNormalizer';
import commonNames from '../dictionaries/common-names.json';

/**
 * Dictionary service for known name translations
 */
export class DictionaryService {
  private dictionary: Map<string, string[]>;
  private reverseDictionary: Map<string, string[]>;
  private normalizer: NameNormalizer;

  constructor() {
    this.normalizer = new NameNormalizer();
    this.dictionary = new Map();
    this.reverseDictionary = new Map();
    this.loadDictionary();
  }

  /**
   * Load dictionary from JSON file
   */
  private loadDictionary(): void {
    // Load English -> Arabic mappings
    for (const [english, arabicVariants] of Object.entries(commonNames)) {
      const normalizedEnglish = this.normalizer.normalizeAuto(english);
      this.dictionary.set(normalizedEnglish, arabicVariants);

      // Build reverse mapping (Arabic -> English)
      for (const arabic of arabicVariants) {
        const normalizedArabic = this.normalizer.normalizeAuto(arabic);
        const existing = this.reverseDictionary.get(normalizedArabic) || [];
        if (!existing.includes(english)) {
          existing.push(english);
        }
        this.reverseDictionary.set(normalizedArabic, existing);
      }
    }
  }

  /**
   * Look up Arabic translations for an English name
   */
  lookupArabic(englishName: string): string[] {
    const normalized = this.normalizer.normalizeAuto(englishName);
    return this.dictionary.get(normalized) || [];
  }

  /**
   * Look up English translations for an Arabic name
   */
  lookupEnglish(arabicName: string): string[] {
    const normalized = this.normalizer.normalizeAuto(arabicName);
    return this.reverseDictionary.get(normalized) || [];
  }

  /**
   * Check if name exists in dictionary (either English or Arabic)
   */
  has(name: string): boolean {
    const normalized = this.normalizer.normalizeAuto(name);
    return this.dictionary.has(normalized) || this.reverseDictionary.has(normalized);
  }

  /**
   * Get all translations for a name (bidirectional)
   */
  getTranslations(name: string): string[] {
    const normalized = this.normalizer.normalizeAuto(name);
    const arabicTranslations = this.dictionary.get(normalized) || [];
    const englishTranslations = this.reverseDictionary.get(normalized) || [];
    return [...arabicTranslations, ...englishTranslations];
  }
}
