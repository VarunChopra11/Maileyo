/**
 * Resizable Contacts Sidebar Persistence & Clamping Utilities
 *
 * Implements boundary clamping [260, 500], default width (320),
 * and fault-tolerant localStorage persistence with corrupted data defense
 * and browser security/quota error recovery.
 */

export const MIN_CONTACTS_WIDTH = 260;
export const MAX_CONTACTS_WIDTH = 500;
export const DEFAULT_CONTACTS_WIDTH = 320;
export const STORAGE_KEY_CONTACTS_WIDTH = "maileyo_contacts_panel_width";

// Aliases for compatibility
export const MIN_SIDEBAR_WIDTH = MIN_CONTACTS_WIDTH;
export const MAX_SIDEBAR_WIDTH = MAX_CONTACTS_WIDTH;
export const DEFAULT_SIDEBAR_WIDTH = DEFAULT_CONTACTS_WIDTH;
export const SIDEBAR_STORAGE_KEY = STORAGE_KEY_CONTACTS_WIDTH;

/**
 * Clamps a given width value to [MIN_CONTACTS_WIDTH, MAX_CONTACTS_WIDTH].
 * Rounds to whole integer pixels. If the input is NaN or invalid,
 * falls back safely to DEFAULT_CONTACTS_WIDTH (320px).
 */
export function clampContactsWidth(width: number): number {
  if (typeof width !== "number" || !Number.isFinite(width)) {
    return DEFAULT_CONTACTS_WIDTH;
  }
  return Math.min(
    Math.max(Math.round(width), MIN_CONTACTS_WIDTH),
    MAX_CONTACTS_WIDTH
  );
}

export const clampSidebarWidth = clampContactsWidth;

/**
 * Safely reads the persisted contacts sidebar width from localStorage.
 * Handles missing keys, corrupted data, non-numeric strings, out-of-range values,
 * and security / private browsing DOMExceptions.
 */
export function getInitialContactsWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_CONTACTS_WIDTH;
  }
  try {
    const storage = window.localStorage;
    if (!storage) {
      return DEFAULT_CONTACTS_WIDTH;
    }
    const raw = storage.getItem(STORAGE_KEY_CONTACTS_WIDTH);
    if (raw === null || raw.trim() === "") {
      return DEFAULT_CONTACTS_WIDTH;
    }
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_CONTACTS_WIDTH;
    }
    return clampContactsWidth(parsed);
  } catch (err) {
    console.warn("[Maileyo] Failed to read contacts panel width from localStorage:", err);
    return DEFAULT_CONTACTS_WIDTH;
  }
}

/**
 * Safely persists the contacts sidebar width to localStorage.
 * Clamps the width before saving. Catches QuotaExceededError and private-mode SecurityErrors.
 */
export function saveContactsWidth(width: number): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const storage = window.localStorage;
    if (!storage) {
      return;
    }
    const clamped = clampContactsWidth(width);
    storage.setItem(STORAGE_KEY_CONTACTS_WIDTH, clamped.toString());
  } catch (err) {
    console.warn("[Maileyo] Failed to save contacts panel width to localStorage:", err);
  }
}
