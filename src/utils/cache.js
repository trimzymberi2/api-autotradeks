const cacheStore = new Map();

function stableStringify(value) {
  if (!value || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => JSON.parse(stableStringify(item))));
  }

  const sorted = Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      if (value[key] !== undefined && value[key] !== null && value[key] !== "") {
        acc[key] = value[key];
      }

      return acc;
    }, {});

  return JSON.stringify(sorted);
}

export function createCacheKey(prefix, params = {}) {
  return `${prefix}:${stableStringify(params)}`;
}

export function getCache(key) {
  return cacheStore.get(key) || null;
}

export function setCache(key, data) {
  cacheStore.set(key, data);
}

export function clearCacheByPrefix(prefix) {
  let cleared = 0;

  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
      cleared += 1;
    }
  }

  return cleared;
}

export function clearRentCarCache() {
  return clearCacheByPrefix("rent-cars:");
}