// Domain restriction for access control.
// To allow additional domains, add them to ALLOWED_DOMAINS.
// To disable domain restriction entirely, set ALLOWED_DOMAINS to null.
const ALLOWED_DOMAINS: string[] | null = ["salesforce.com"];
// const ALLOWED_DOMAINS: string[] | null = null; // unrestricted mode

export function isEmailAllowed(email: string | null): boolean {
  if (email === null) return true; // local dev: CF header absent
  if (ALLOWED_DOMAINS === null) return true; // unrestricted mode
  return ALLOWED_DOMAINS.some((d) => email.endsWith(`@${d}`));
}
