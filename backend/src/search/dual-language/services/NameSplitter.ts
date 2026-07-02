/**
 * Splits compound names into parts
 */
export class NameSplitter {
  private arabicParticles = [
    'عبد',
    'عبد ال',
    'عبدال',
    'ابن',
    'بن',
    'ال',
    'ابو',
    'أبو',
    'ام',
    'أم'
  ];

  /**
   * Split name into parts
   */
  split(name: string): string[] {
    if (!name || name.trim().length === 0) {
      return [];
    }

    // First, try to handle compound Arabic names
    const compoundSplit = this.splitCompoundArabic(name);
    if (compoundSplit.length > 1) {
      return compoundSplit;
    }

    // Otherwise, split by spaces
    return name.split(/\s+/).filter(part => part.length > 0);
  }

  /**
   * Split compound Arabic names (e.g., عبدالرحمن → عبد الرحمن)
   */
  private splitCompoundArabic(name: string): string[] {
    // Check for عبدال pattern
    if (name.includes('عبدال')) {
      const parts = name.split('عبدال');
      if (parts.length === 2 && parts[1].length > 0) {
        return ['عبد', 'ال' + parts[1]];
      }
    }

    // Check for عبد followed by another word
    if (name.startsWith('عبد') && !name.startsWith('عبد ')) {
      const remainder = name.substring(3);
      if (remainder.length > 0) {
        return ['عبد', remainder];
      }
    }

    // Default: split by spaces
    return name.split(/\s+/).filter(part => part.length > 0);
  }

  /**
   * Generate variations with and without spaces for compound names
   */
  generateSpacingVariations(name: string): string[] {
    const variations = [name];

    // If name has spaces, add version without spaces
    if (name.includes(' ')) {
      variations.push(name.replace(/\s+/g, ''));
    }

    // For compound Arabic names, add variations
    if (name.includes('عبد ال')) {
      variations.push(name.replace('عبد ال', 'عبدال'));
    } else if (name.includes('عبدال')) {
      variations.push(name.replace('عبدال', 'عبد ال'));
    }

    // Handle "Abdel Rahman" <-> "Abdelrahman"
    if (name.toLowerCase().includes('abdel ')) {
      variations.push(name.toLowerCase().replace('abdel ', 'abdel'));
    } else if (name.toLowerCase().includes('abdel') && !name.includes(' ')) {
      const spaced = name.replace(/abdel/i, 'Abdel ');
      variations.push(spaced);
    }

    return [...new Set(variations)]; // Remove duplicates
  }
}
