/**
 * Transliteration rules from Arabic to English
 */

export const arabicToEnglishRules: Record<string, string[]> = {
  // Arabic consonants - multiple English variations
  'ا': ['a', 'e'],
  'أ': ['a'],
  'إ': ['i', 'e'],
  'آ': ['a'],
  'ب': ['b'],
  'ت': ['t'],
  'ث': ['th'],
  'ج': ['j', 'g'],
  'ح': ['h'],
  'خ': ['kh', 'x'],
  'د': ['d'],
  'ذ': ['dh', 'z'],
  'ر': ['r'],
  'ز': ['z'],
  'س': ['s'],
  'ش': ['sh'],
  'ص': ['s'],
  'ض': ['d'],
  'ط': ['t'],
  'ظ': ['z', 'dh'],
  'ع': ['a', 'e'],
  'غ': ['gh', 'g'],
  'ف': ['f', 'ph'],
  'ق': ['q', 'k'],
  'ك': ['k', 'c'],
  'ل': ['l'],
  'م': ['m'],
  'ن': ['n'],
  'ه': ['h'],
  'ة': ['h', 'a'],
  'و': ['w', 'o', 'u', 'ou'],
  'ي': ['y', 'i', 'e', 'ee'],
  'ى': ['a', 'y'],
  'ء': [''],
  'ئ': [''],
  'ؤ': ['o', 'u']
};

/**
 * Common spelling variations for Arabic names
 */
export const commonVariations: Record<string, string[]> = {
  'محمد': ['mohamed', 'muhammad', 'mohammad', 'mohammed', 'mohamad'],
  'أحمد': ['ahmed', 'ahmad'],
  'عبد الرحمن': ['abdelrahman', 'abdulrahman', 'abdel rahman', 'abdul rahman'],
  'عبد الله': ['abdullah', 'abdallah', 'abdel allah'],
  'عبد العزيز': ['abdelaziz', 'abdulaziz', 'abdel aziz'],
  'يوسف': ['youssef', 'yousef', 'yusuf', 'joseph'],
  'إبراهيم': ['ibrahim', 'abraham'],
  'إسماعيل': ['ismail', 'ismael']
};
