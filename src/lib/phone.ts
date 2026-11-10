import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** "600 11 12 22", "0034 600111222", "+34600111222" -> "+34600111222". Null when it is not a real number. */
export function normalizePhone(input: string, defaultCountry: 'ES' = 'ES'): string | null {
  const cleaned = input.trim().replace(/^00/, '+');
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number; // E.164
}

/** the synthetic login address behind a WhatsApp number (members never see or use it) */
export function loginEmail(e164: string): string {
  return `${e164.replace(/\D/g, '')}@members.mesa.invalid`;
}

/** "wa.me" wants digits only */
export function waDigits(e164: string): string {
  return e164.replace(/\D/g, '');
}
