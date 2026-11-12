/**
 * The date of sale a new card starts with. Today when the entry month is the current month or earlier;
 * the first day of the entry month when that month is still ahead (for example December while it is
 * still November), so a brand-new card is never flagged as a late entry before anyone has chosen a date.
 */
export function defaultSaleDate(entryMonth: string, today: string): string {
  return entryMonth > today.slice(0, 7) + "-01" ? entryMonth : today;
}
