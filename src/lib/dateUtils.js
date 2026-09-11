// Parses a date from a catch record, handling server-returned ISO strings
// that may lack the 'Z' UTC suffix (which JavaScript would parse as local time).
// Prioritizes the catch's `date` field (actual catch time) over `created_date`
// (server record creation time, which for offline catches = sync time).
export function parseCatchDate(c) {
  const d = c.date || c.created_date || 0;
  if (typeof d === "string" && d.includes("T") && !d.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(d)) {
    return new Date(d + "Z");
  }
  return new Date(d);
}