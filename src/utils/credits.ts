// Skill Credits mirror the database rule: 10 credits per verified 60 minutes,
// pro-rated by duration and rounded down. The backend is still authoritative;
// this helper only keeps the cost shown in the UI in sync with the RPC.
export const CREDITS_PER_HOUR = 10;
export const MINUTES_PER_CREDIT = 60 / CREDITS_PER_HOUR;

export const calculateCreditCost = (durationMinutes: number): number => {
  if (!Number.isFinite(durationMinutes) || durationMinutes < 0) {
    return 0;
  }

  return Math.floor(durationMinutes / MINUTES_PER_CREDIT);
};
