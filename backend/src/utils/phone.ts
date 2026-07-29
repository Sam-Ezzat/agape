/**
 * Phone Number Normalization
 *
 * WHY: WhatsApp requires a full international number (country code + subscriber
 * number, no leading 0/+). Attendees are entered in mixed formats — local Egyptian
 * format with a trunk "0" (e.g. 01271384211), already-international (201271384211,
 * +201271384211), or a bare 10-digit number missing its country code entirely.
 * Silently sending an un-normalized number to whatsapp-web.js produces an opaque
 * puppeteer crash instead of a usable error, so normalization + validation happens
 * once here and is shared by anything that sends a WhatsApp message.
 */

const DEFAULT_COUNTRY_CODE = '20'; // Egypt

export class InvalidPhoneNumberError extends Error {
  constructor(phone: string, reason: string) {
    super(`Invalid phone number "${phone}": ${reason}`);
    this.name = 'InvalidPhoneNumberError';
  }
}

/**
 * Normalize a raw phone number into digits-only, country-coded form (no leading + or 0).
 * Throws InvalidPhoneNumberError if the result doesn't look like a real international number.
 */
export function normalizePhoneNumber(
  phone: string | null | undefined,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE
): string {
  if (!phone || !phone.trim()) {
    throw new InvalidPhoneNumberError(phone || '', 'phone number is empty');
  }

  let cleaned = phone.trim();

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith('00')) {
    cleaned = cleaned.slice(2);
  }

  cleaned = cleaned.replace(/\D/g, '');

  if (!cleaned) {
    throw new InvalidPhoneNumberError(phone, 'no digits found');
  }

  if (cleaned.startsWith('0')) {
    // Local format with trunk prefix, e.g. 01271384211 -> 1271384211 -> 201271384211
    cleaned = defaultCountryCode + cleaned.slice(1);
  } else if (!cleaned.startsWith(defaultCountryCode) && cleaned.length === 10) {
    // Bare local number with no trunk prefix and no country code, e.g. 1271384211
    cleaned = defaultCountryCode + cleaned;
  }

  // E.164 numbers are 8-15 digits once the country code is included
  if (!/^\d{8,15}$/.test(cleaned)) {
    throw new InvalidPhoneNumberError(
      phone,
      `missing or invalid country code — expected a full international number (e.g. +${defaultCountryCode}XXXXXXXXXX)`
    );
  }

  return cleaned;
}

/**
 * Returns true if the phone number normalizes to a valid international number.
 */
export function isValidPhoneNumber(phone: string | null | undefined, defaultCountryCode?: string): boolean {
  try {
    normalizePhoneNumber(phone, defaultCountryCode);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize a raw phone number into E.164 display form, i.e. "+" followed by
 * the country code and subscriber number (e.g. "+201271384211"). This is the
 * canonical format attendee records are stored in.
 */
export function toE164(phone: string | null | undefined, defaultCountryCode?: string): string {
  return `+${normalizePhoneNumber(phone, defaultCountryCode)}`;
}
