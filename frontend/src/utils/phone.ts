/**
 * Phone Number Normalization
 *
 * WHY: Mirrors the backend's normalization (backend/src/utils/phone.ts) so the
 * attendee form can validate/format a phone number before it's ever sent to the
 * API, instead of round-tripping to find out it's missing a country code.
 * Attendees are stored as E.164 ("+" + country code + subscriber number).
 */

const DEFAULT_COUNTRY_CODE = '20'; // Egypt

// Non-Latin decimal digit scripts seen in Excel imports: Arabic-Indic (٠-٩),
// Extended Arabic-Indic/Persian (۰-۹), and Devanagari/Hindi (०-९). Each block
// is 10 consecutive code points in digit order, so offsetting by the block's
// zero code point maps them onto ASCII '0'-'9'.
const NON_LATIN_DIGIT_BLOCKS = [0x0660, 0x06f0, 0x0966];

function toLatinDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹०-९]/g, (ch) => {
    const code = ch.codePointAt(0)!;
    const zero = NON_LATIN_DIGIT_BLOCKS.find((base) => code >= base && code <= base + 9)!;
    return String(code - zero);
  });
}

/**
 * Normalize a raw phone number to E.164 display form (e.g. "+201271384211").
 * Returns null if the number can't be normalized to a valid international number.
 */
export function normalizePhoneToE164(
  phone: string,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE
): string | null {
  if (!phone || !phone.trim()) return null;

  let cleaned = toLatinDigits(phone.trim());

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith('00')) {
    cleaned = cleaned.slice(2);
  }

  cleaned = cleaned.replace(/\D/g, '');

  if (!cleaned) return null;

  if (cleaned.startsWith('0')) {
    // Local format with trunk prefix, e.g. 01271384211 -> 1271384211 -> 201271384211
    cleaned = defaultCountryCode + cleaned.slice(1);
  } else if (!cleaned.startsWith(defaultCountryCode) && cleaned.length === 10) {
    // Bare local number with no trunk prefix and no country code
    cleaned = defaultCountryCode + cleaned;
  }

  if (!/^\d{8,15}$/.test(cleaned)) return null;

  return `+${cleaned}`;
}

export function isValidE164Phone(phone: string): boolean {
  return normalizePhoneToE164(phone) !== null;
}
