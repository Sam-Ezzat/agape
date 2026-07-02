/**
 * Transliteration rules from English to Arabic
 * Multi-letter rules are processed first, then single-letter rules
 */

export const multiLetterRules: Record<string, string> = {
  // Common English digraphs and trigraphs
  'sh': 'ش',
  'ch': 'تش',
  'kh': 'خ',
  'gh': 'غ',
  'th': 'ث',
  'dh': 'ذ',
  'ph': 'ف',
  
  // Vowel combinations
  'oo': 'و',
  'ou': 'و',
  'ee': 'ي',
  'ea': 'ي',
  'ai': 'اي',
  'ay': 'اي',
  'ey': 'اي',
  'aw': 'او',
  'ow': 'او',
  
  // Special cases
  'tion': 'شن',
  'sion': 'شن'
};

export const singleLetterRules: Record<string, string> = {
  // Consonants
  'b': 'ب',
  'c': 'ك',
  'd': 'د',
  'f': 'ف',
  'g': 'ج',
  'h': 'ه',
  'j': 'ج',
  'k': 'ك',
  'l': 'ل',
  'm': 'م',
  'n': 'ن',
  'p': 'ب',
  'q': 'ق',
  'r': 'ر',
  's': 'س',
  't': 'ت',
  'v': 'ف',
  'w': 'و',
  'x': 'كس',
  'y': 'ي',
  'z': 'ز',
  
  // Vowels
  'a': 'ا',
  'e': 'ي',
  'i': 'ي',
  'o': 'و',
  'u': 'و'
};
