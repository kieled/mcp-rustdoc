// ─── In-memory LRU cache with stale-while-revalidate ─────

const DEFAULT_TTL = 5 * 60 * 1000;   // 5 minutes — fresh window
const STALE_GRACE = 15 * 60 * 1000;  // 15 minutes — serve stale data up to this
const MAX_ENTRIES = 500;

interface CacheEntry<T> {
  data: T;
  expiry: number;
  staleExpiry: number;
  lastAccess: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Get a cached value. Returns data if within fresh or stale window.
 * Returns null if expired beyond stale grace or missing.
 */
export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now > entry.staleExpiry) {
    store.delete(key);
    return null;
  }

  entry.lastAccess = now;
  return entry.data as T;
}

/** Check if a cached key exists but is past its fresh TTL. */
export function cacheIsStale(key: string): boolean {
  const entry = store.get(key);
  if (!entry) return true;
  return Date.now() > entry.expiry;
}

export function cacheSet<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
  // Evict LRU entries if at capacity
  while (store.size >= MAX_ENTRIES) evictLru();

  const now = Date.now();
  store.set(key, {
    data,
    expiry: now + ttl,
    staleExpiry: now + STALE_GRACE,
    lastAccess: now,
  });
}

function evictLru(): void {
  let oldestKey: string | null = null;
  let oldestAccess = Infinity;
  for (const [key, entry] of store) {
    if (entry.lastAccess < oldestAccess) {
      oldestAccess = entry.lastAccess;
      oldestKey = key;
    }
  }
  if (oldestKey) store.delete(oldestKey);
}

export function cacheStats(): { size: number; maxEntries: number } {
  return { size: store.size, maxEntries: MAX_ENTRIES };
}
