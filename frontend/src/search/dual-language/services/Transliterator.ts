import { Language } from '../models/Language';
import { multiLetterRules, singleLetterRules } from '../rules/englishToArabic';
import { arabicToEnglishRules, commonVariations } from '../rules/arabicToEnglish';

/**
 * Transliterates names between English and Arabic
 */
export class Transliterator {
  /**
   * Transliterate text based on language
   */
  transliterate(text: string, fromLanguage: Language): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    if (fromLanguage === Language.ENGLISH) {
      return [this.englishToArabic(text)];
    } else if (fromLanguage === Language.ARABIC) {
      return this.arabicToEnglish(text);
    }

    return [];
  }

  /**
   * Transliterate English to Arabic using rules
   */
  private englishToArabic(text: string): string {
    let result = text.toLowerCase();

    // Apply multi-letter rules first (order matters!)
    for (const [english, arabic] of Object.entries(multiLetterRules)) {
      result = result.replace(new RegExp(english, 'g'), arabic);
    }

    // Apply single-letter rules
    for (const [english, arabic] of Object.entries(singleLetterRules)) {
      result = result.replace(new RegExp(english, 'g'), arabic);
    }

    return result;
  }

  /**
   * Transliterate Arabic to English using rules
   * Returns multiple variations to account for different spellings
   */
  private arabicToEnglish(text: string): string[] {
    // Check if we have a common variation first
    for (const [arabic, variations] of Object.entries(commonVariations)) {
      if (text.includes(arabic)) {
        return variations;
      }
    }

    // Build variations by trying different letter combinations
    const variations = this.buildEnglishVariations(text);
    return variations.slice(0, 5); // Limit to 5 variations to avoid explosion
  }

  /**
   * Build multiple English variations from Arabic text
   */
  private buildEnglishVariations(text: string): string[] {
    const chars = Array.from(text);
    const variations: string[] = [''];

    for (const char of chars) {
      const englishOptions = arabicToEnglishRules[char] || [char];
      const newVariations: string[] = [];

      for (const variation of variations) {
        for (const option of englishOptions) {
          newVariations.push(variation + option);
        }
      }

      // Keep only unique variations and limit growth
      const uniqueVariations = [...new Set(newVariations)];
      variations.length = 0;
      variations.push(...uniqueVariations.slice(0, 20)); // Limit to prevent explosion
    }

    return variations;
  }

  /**
   * Generate spelling variations for common names
   */
  generateSpellingVariations(name: string): string[] {
    const variations = new Set<string>([name]);
    const lower = name.toLowerCase();

    // Mohamed variations
    if (lower.includes('mohamed') || lower.includes('muhammad') || lower.includes('mohammad')) {
      variations.add(name.replace(/mohamed/gi, 'mohammad'));
      variations.add(name.replace(/mohamed/gi, 'muhammad'));
      variations.add(name.replace(/mohamed/gi, 'mohamad'));
      variations.add(name.replace(/mohammad/gi, 'mohamed'));
      variations.add(name.replace(/muhammad/gi, 'mohamed'));
    }

    // Ahmed variations
    if (lower.includes('ahmed') || lower.includes('ahmad')) {
      variations.add(name.replace(/ahmed/gi, 'ahmad'));
      variations.add(name.replace(/ahmad/gi, 'ahmed'));
    }

    // Abdel/Abdul variations
    if (lower.includes('abdel')) {
      variations.add(name.replace(/abdel/gi, 'abdul'));
      variations.add(name.replace(/abdel /gi, 'abdel'));
    } else if (lower.includes('abdul')) {
      variations.add(name.replace(/abdul/gi, 'abdel'));
    }

    // Youssef variations
    if (lower.includes('youssef') || lower.includes('yousef') || lower.includes('yusuf')) {
      variations.add(name.replace(/youssef/gi, 'yousef'));
      variations.add(name.replace(/youssef/gi, 'yusuf'));
      variations.add(name.replace(/yousef/gi, 'youssef'));
      variations.add(name.replace(/yusuf/gi, 'youssef'));
    }

    return Array.from(variations);
  }
}
