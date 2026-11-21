'use client';

import { useEffect, useRef } from 'react';

/**
 * Flash an element when its value changes between renders or visits (a block resolved, a figure
 * that dropped). The last value is kept per viewer in sessionStorage, so a fresh page shows no
 * flash and a server-action re-render does. Background and a short rise only; reduced motion
 * keeps the change and drops the flash.
 */
export function useFlash<T extends HTMLElement>(key: string, value: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let prev: string | null = null;
    try {
      prev = sessionStorage.getItem(`pg-flash:${key}`);
      sessionStorage.setItem(`pg-flash:${key}`, value);
    } catch {
      return;
    }
    if (prev === null || prev === value) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.animate(
      [
        { backgroundColor: 'var(--accent-tint)', transform: 'translateY(3px)' },
        { backgroundColor: 'var(--accent-tint)', transform: 'none', offset: 0.25 },
        { backgroundColor: 'var(--surface)', transform: 'none' },
      ],
      { duration: 1800, easing: 'cubic-bezier(.2,.7,.2,1)' },
    );
  }, [key, value]);
  return ref;
}
