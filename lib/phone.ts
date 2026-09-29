import { findPhoneNumbersInText } from "libphonenumber-js/max";

/** Numéros de téléphone trouvés dans un texte (France par défaut), au format international. */
export function extractPhones(text: string): string[] {
  const found = new Set<string>();
  for (const m of findPhoneNumbersInText(text, "FR")) {
    if (m.number.isValid()) found.add(m.number.number);
  }
  return [...found];
}

/** +33612345678 → 06 12 34 56 78 pour la France, sinon format international lisible. */
export function prettyPhone(e164: string): string {
  if (/^\+33\d{9}$/.test(e164)) return ("0" + e164.slice(3)).replace(/(\d{2})(?=\d)/g, "$1 ");
  return e164;
}
