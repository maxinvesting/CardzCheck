import type { RecentSearch } from "@/types";

const STORAGE_KEY = "cardzcheck_recent_searches";
const MAX_ITEMS = 20;

// Check if we're in a browser environment
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

// Get all recent searches from localStorage
export function getRecentSearches(): RecentSearch[] {
  if (!isBrowser()) return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const searches = JSON.parse(stored) as RecentSearch[];
    // Sort by timestamp descending (most recent first)
    return searches.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    console.error("Failed to parse recent searches from localStorage");
    return [];
  }
}

// Add a new search to recent searches
export function addRecentSearch(search: RecentSearch): void {
  if (!isBrowser()) return;

  try {
    const searches = getRecentSearches();

    // Check if this exact query already exists
    const existingIndex = searches.findIndex(
      (s) => s.query.toLowerCase() === search.query.toLowerCase()
    );

    if (existingIndex !== -1) {
      // Update existing entry with new timestamp and results
      searches[existingIndex] = {
        ...searches[existingIndex],
        ...search,
        timestamp: Date.now(),
      };
    } else {
      // Add new entry at the beginning
      searches.unshift({
        ...search,
        timestamp: Date.now(),
      });
    }

    // Keep only the most recent MAX_ITEMS
    const trimmed = searches.slice(0, MAX_ITEMS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error("Failed to save recent search:", error);
  }
}

// Remove a specific search by timestamp
export function removeRecentSearch(timestamp: number): void {
  if (!isBrowser()) return;

  try {
    const searches = getRecentSearches();
    const filtered = searches.filter((s) => s.timestamp !== timestamp);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Failed to remove recent search:", error);
  }
}

// Clear all recent searches
export function clearRecentSearches(): void {
  if (!isBrowser()) return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear recent searches:", error);
  }
}

// Get the most recent N searches
export function getTopRecentSearches(count: number = 5): RecentSearch[] {
  return getRecentSearches().slice(0, count);
}
