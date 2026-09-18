/**
 * Room Capacity Utilities
 *
 * WHY: Single source of truth for how a room's capacity and amenities
 * summary are derived from its bed counts, used by manual create/update
 * and Excel import alike.
 */

export interface BedCounts {
  individualBeds: number;
  bunkBeds: number;
  kingBeds: number;
}

/** Maximum people allowed in a single room */
export const MAX_ROOM_CAPACITY = 20;

/**
 * Compute room capacity from bed counts.
 * WHY: A bunk bed sleeps 2 people; individual and king beds each sleep 1.
 */
export function computeRoomCapacity({ individualBeds, bunkBeds, kingBeds }: BedCounts): number {
  return individualBeds + kingBeds + bunkBeds * 2;
}

/**
 * Generate the auto-populated amenities text summarizing bed counts.
 */
export function generateAmenitiesText({ individualBeds, bunkBeds, kingBeds }: BedCounts): string {
  return `Individual Beds: ${individualBeds}, Bunk Beds: ${bunkBeds}, King Beds: ${kingBeds}`;
}
