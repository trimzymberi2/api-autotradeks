export function resolvePickupLocations(body, existing = null) {
  let locations = body.pickup_locations;
  if (locations === undefined) {
    // Keep multi-location listings intact when an older client resaves its city.
    locations = existing && (body.city === undefined || body.city === existing.city)
      ? (existing.pickup_locations?.length ? existing.pickup_locations : [existing.city])
      : [body.city];
  } else if (typeof locations === "string") {
    try { locations = JSON.parse(locations); } catch { locations = null; }
  }

  if (!Array.isArray(locations) || locations.length === 0 || locations.length > 30 ||
      locations.some((location) => typeof location !== "string" || !location.trim() || location.trim().length > 100)) {
    const error = new Error("Zgjidhni te pakten nje lokacion te marrjes (maksimum 30).");
    error.status = 400;
    throw error;
  }
  return [...new Set(locations.map((location) => location.trim()))];
}

export function pickupLocationFilter(parameter) {
  return `(rent_cars.city = $${parameter} OR rent_cars.pickup_locations @> ARRAY[$${parameter}]::text[])`;
}
