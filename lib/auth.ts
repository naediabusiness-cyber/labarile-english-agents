/** Session du tableau de bord : un cookie dérivé du mot de passe admin. */

export const SESSION_COOKIE = "la_session";

export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`labarile-agents:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  const pw = (process.env.ADMIN_PASSWORD ?? "").trim();
  if (!pw || !cookieValue) return false;
  return cookieValue === (await sessionToken(pw));
}

/** Pour les scripts (npm run brain:push) : en-tête x-admin-password. */
export function isValidAdminHeader(value: string | null): boolean {
  const pw = (process.env.ADMIN_PASSWORD ?? "").trim();
  return !!pw && !!value && value === pw;
}
