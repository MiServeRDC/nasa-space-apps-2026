import { useEffect, useState } from 'react';

/**
 * Phase E flight-deck breakpoint. `>= 1024px` keeps the zero-scroll 3-column bento cockpit;
 * `< 1024px` switches to the stacked mobile flight deck (44px horizon, triage banner,
 * 42dvh aperture, tabbed decks).
 */
export const DESKTOP_VIEWPORT_QUERY = '(min-width: 1024px)';

function readDesktopMatch(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    // Server-side rendering and node tests default to the desktop cockpit markup.
    return true;
  }
  return window.matchMedia(DESKTOP_VIEWPORT_QUERY).matches;
}

export function useDesktopViewport(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(readDesktopMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(DESKTOP_VIEWPORT_QUERY);
    const update = (): void => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isDesktop;
}
