import { useSyncExternalStore } from "react";

/**
 * Whether the getting-started card has been dismissed, remembered per signed-in user in this browser. It reads
 * localStorage as an external store, so it needs no effect and stays in step across tabs.
 */
const key = (userId: string) => `dropboard-guide-dismissed:${userId}`;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useGuideVisible(userId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key(userId)) !== "1",
    // never shown while rendering on the server
    () => false,
  );
}

export function dismissGuide(userId: string) {
  localStorage.setItem(key(userId), "1");
  notify();
}

export function showGuideAgain(userId: string) {
  localStorage.removeItem(key(userId));
  notify();
}
