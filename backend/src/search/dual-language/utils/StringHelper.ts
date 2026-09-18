/**
 * String utility functions for dual-language search
 */
export class StringHelper {
  /**
   * Check if a character is Arabic
   */
  static isArabicChar(char: string): boolean {
    const code = char.charCodeAt(0);
    return (code >= 0x0600 && code <= 0x06FF) || // Arabic
           (code >= 0x0750 && code <= 0x077F) || // Arabic Supplement
           (code >= 0xFB50 && code <= 0xFDFF) || // Arabic Presentation Forms-A
           (code >= 0xFE70 && code <= 0xFEFF);   // Arabic Presentation Forms-B
  }

  /**
   * Check if a character is English (Latin)
   */
  static isEnglishChar(char: string): boolean {
    const code = char.charCodeAt(0);
    return (code >= 0x0041 && code <= 0x005A) || // A-Z
           (code >= 0x0061 && code <= 0x007A);   // a-z
  }

  /**
   * Check if string contains Arabic characters
   */
  static hasArabic(text: string): boolean {
    return Array.from(text).some(char => this.isArabicChar(char));
  }

  /**
   * Check if string contains English characters
   */
  static hasEnglish(text: string): boolean {
    return Array.from(text).some(char => this.isEnglishChar(char));
  }

  /**
   * Remove Arabic diacritics (tashkeel)
   */
  static removeTashkeel(text: string): string {
    return text.replace(/[\u064B-\u065F\u0670]/g, '');
  }

  /**
   * Remove Arabic tatweel (ـ)
   */
  static removeTatweel(text: string): string {
    return text.replace(/\u0640/g, '');
  }

  /**
   * Normalize whitespace
   */
  static normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Remove punctuation
   */
  static removePunctuation(text: string): string {
    return text.replace(/[^\w\s\u0600-\u06FF]/g, '');
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  static levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Calculate similarity percentage (0-100)
   */
  static calculateSimilarity(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 100;
    
    const distance = this.levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    return Math.round(((maxLen - distance) / maxLen) * 100);
  }
}
