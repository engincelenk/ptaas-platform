/** Domain/endpoint verification is only trusted for this long (re-check required after). */
export const VERIFICATION_TTL_DAYS = 30;

export function isVerificationFresh(
  verifiedAt: Date | null | undefined,
  now: Date = new Date(),
  ttlDays: number = VERIFICATION_TTL_DAYS,
): boolean {
  if (!verifiedAt) return false;
  return now.getTime() - verifiedAt.getTime() <= ttlDays * 86_400_000;
}
