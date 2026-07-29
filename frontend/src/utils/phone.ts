/**
 * Phone Number Normalization
 *
 * WHY: Mirrors the backend's normalization (backend/src/utils/phone.ts) so the
 * attendee form can validate/format a phone number before it's ever sent to the
 * API, instead of round-tripping to find out it's missing a country code.
 * Attendees are stored as E.164 ("+" + country code + subscriber number).
 */

const DEFAULT_COUNTRY_CODE = '20'; // Egypt

/**
 * Normalize a raw phone number to E.164 display form (e.g. "+201271384211").
 * Returns null if the number can't be normalized to a valid international number.
 */
export function normalizePhoneToE164(
  phone: string,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE
): string | null {
  if (!phone || !phone.trim()) return null;

  let cleaned = phone.trim();

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
