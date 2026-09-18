import { Language } from '../models/Language';
import { StringHelper } from '../utils/StringHelper';

/**
 * Detects the language of input text
 */
export class LanguageDetector {
  /**
   * Detect language of text
   */
  detect(text: string): Language {
    if (!text || text.trim().length === 0) {
      return Language.UNKNOWN;
    }

    const hasArabic = StringHelper.hasArabic(text);
    const hasEnglish = StringHelper.hasEnglish(text);

    if (hasArabic && hasEnglish) {
      return Language.MIXED;
    } else if (hasArabic) {
      return Language.ARABIC;
    } else if (hasEnglish) {
      return Language.ENGLISH;
    }

    return Language.UNKNOWN;
  }

  /**
   * Detect primary language (for mixed inputs, returns first detected)
   */
  detectPrimary(text: string): Language {
    const language = this.detect(text);
    
    if (language === Language.MIXED) {
      // Return the first language detected
      const chars = Array.from(text);
      for (const char of chars) {
        if (StringHelper.isArabicChar(char)) {
          return Language.ARABIC;
        } else if (StringHelper.isEnglishChar(char)) {
          return Language.ENGLISH;
        }
      }
    }

    return language;
  }
}
