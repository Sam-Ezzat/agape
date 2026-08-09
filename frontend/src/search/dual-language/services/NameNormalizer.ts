import { Language } from '../models/Language';
import { StringHelper } from '../utils/StringHelper';

/**
 * Normalizes names for consistent searching
 */
export class NameNormalizer {
  /**
   * Normalize text based on language
   */
  normalize(text: string, language: Language): string {
    if (!text) return '';

    let normalized = text;

    // Apply language-specific normalization
    if (language === Language.ARABIC || language === Language.MIXED) {
      normalized = this.normalizeArabic(normalized);
    }
    
    if (language === Language.ENGLISH || language === Language.MIXED) {
      normalized = this.normalizeEnglish(normalized);
    }

    // Common normalization
    normalized = StringHelper.normalizeWhitespace(normalized);

    return normalized;
  }

  /**
   * Normalize Arabic text
   */
  private normalizeArabic(text: string): string {
    let normalized = text;

    // Remove tashkeel (diacritics)
    normalized = StringHelper.removeTashkeel(normalized);

    // Remove tatweel
    normalized = StringHelper.removeTatweel(normalized);

    // Normalize Alef variations: أ إ آ → ا
    normalized = normalized.replace(/[أإآ]/g, 'ا');

    // Normalize Taa Marbuta: ة → ه
    normalized = normalized.replace(/ة/g, 'ه');

    // Normalize Alef Maksura: ى → ي
    normalized = normalized.replace(/ى/g, 'ي');

    return normalized;
  }

  /**
   * Normalize English text
   */
  private normalizeEnglish(text: string): string {
    let normalized = text;

    // Convert to lowercase
    normalized = normalized.toLowerCase();

    // Remove extra spaces
    normalized = StringHelper.normalizeWhitespace(normalized);

    return normalized;
  }

  /**
   * Normalize text without knowing the language (auto-detect)
   */
  normalizeAuto(text: string): string {
    if (!text) return '';

    const hasArabic = StringHelper.hasArabic(text);
    const hasEnglish = StringHelper.hasEnglish(text);

    let language = Language.UNKNOWN;
    if (hasArabic && hasEnglish) {
      language = Language.MIXED;
    } else if (hasArabic) {
      language = Language.ARABIC;
    } else if (hasEnglish) {
      language = Language.ENGLISH;
    }

    return this.normalize(text, language);
  }
}
