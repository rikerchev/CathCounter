/**
 * Pricing module — auto-calculates per-country ad prices from a base price
 * using population ratios. Bulgaria (6.5M) is the baseline (multiplier ×1).
 *
 * Examples:
 *   Bulgaria  (6.5M)  → ×1.00
 *   Romania  (21.9M) → ×3.37
 *   Moldova  (2.4M)  → ×0.37
 *   Czechia  (10.9M) → ×1.68
 */

export const BASE_POPULATION = 6500000; // Bulgaria

/** Population (approx) keyed by ISO code. */
export const COUNTRY_POPULATION = {
  BG: 6_500_000,
  GB: 67_000_000,
  US: 331_000_000,
  IE: 5_100_000,
  AU: 25_700_000,
  NZ: 5_100_000,
  CA: 38_000_000,
  RO: 21_900_000,
  MD: 2_400_000,
  HU: 9_700_000,
  FR: 67_400_000,
  BE: 11_500_000,
  LU: 640_000,
  MC: 39_000,
  DE: 83_200_000,
  AT: 8_900_000,
  CH: 8_700_000,
  LI: 39_000,
  IT: 59_000_000,
  SM: 34_000,
  RU: 144_400_000,
  BY: 9_400_000,
  KZ: 18_900_000,
  KG: 6_600_000,
  UA: 41_400_000,
  PL: 37_900_000,
  CZ: 10_900_000,
  NL: 17_500_000,
  ES: 47_400_000,
  MX: 126_000_000,
  AR: 45_400_000,
  CO: 51_000_000,
  PE: 33_000_000,
  VE: 28_400_000,
  CL: 19_100_000,
  EC: 17_800_000,
  GT: 17_900_000,
  CU: 11_300_000,
  BO: 11_800_000,
  DO: 10_800_000,
  HN: 9_900_000,
  PY: 7_100_000,
  SV: 6_500_000,
  NI: 6_600_000,
  CR: 5_100_000,
  PA: 4_300_000,
  UY: 3_500_000,
  PR: 3_200_000,
  GQ: 1_400_000,
  RS: 6_900_000,
  SK: 5_400_000,
  ZA: 60_400_000,
  MK: 2_100_000,
  TR: 84_000_000,
  HR: 3_900_000,
  SI: 2_100_000,
  AL: 2_800_000,
  XK: 1_800_000,
  BA: 3_200_000,
  ME: 620_000,
  GR: 10_700_000,
};

/**
 * Get the price multiplier for a country (population / BASE_POPULATION).
 * @param {string} code — ISO country code
 * @returns {number}
 */
export function getCountryMultiplier(code) {
  const pop = COUNTRY_POPULATION[code];
  if (!pop) return 1; // unknown country defaults to base price
  return Math.round((pop / BASE_POPULATION) * 100) / 100;
}

/**
 * Calculate the monthly price for a specific country.
 * @param {number} basePrice — base monthly price (Bulgaria = ×1)
 * @param {string} code — ISO country code
 * @returns {number}
 */
export function calculateCountryPrice(basePrice, code) {
  return Math.round((basePrice * getCountryMultiplier(code)) * 100) / 100;
}

/**
 * Calculate the total monthly price for a set of selected countries.
 * @param {number} basePrice
 * @param {string[]} countryCodes
 * @returns {number}
 */
export function calculateMonthlyTotal(basePrice, countryCodes) {
  const sum = countryCodes.reduce(
    (acc, code) => acc + calculateCountryPrice(basePrice, code),
    0
  );
  return Math.round(sum * 100) / 100;
}

/**
 * Calculate the total price for a period.
 * @param {number} basePrice
 * @param {string[]} countryCodes
 * @param {number} months
 * @returns {number}
 */
export function calculateTotalPrice(basePrice, countryCodes, months) {
  return Math.round(calculateMonthlyTotal(basePrice, countryCodes) * months * 100) / 100;
}