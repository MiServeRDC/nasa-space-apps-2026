// Smooth scroll unifier: Lenis inertia + GSAP ScrollTrigger ticker bridge.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.
// Handles `prefers-reduced-motion: reduce` by disabling smoothing on demand.

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export interface SmoothScrollContextValue {
  /** Live Lenis instance. Null before mount or when reduced-motion is active. */
  lenis: Lenis | null;
}

const SmoothScrollContext = createContext<SmoothScrollContextValue>({ lenis: null });

function isReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const [lenisInstance, setLenisInstance] = useState<Lenis | null>(null);
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    // Respect prefers-reduced-motion: when active, do NOT create Lenis so the
    // browser handles scroll natively (no smoothing or inertia).
    if (isReducedMotion()) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 2,
      smoothWheel: true,
    });

    lenisRef.current = lenis;
    setLenisInstance(lenis);
    if (typeof window !== 'undefined') {
      (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
    }

    // Bridge Lenis scroll events into ScrollTrigger so GSAP animations stay
    // in sync with the inertial scroll position.
    lenis.on('scroll', ScrollTrigger.update);

    // Drive the Lenis raf loop via the GSAP ticker to avoid a double-rAF
    // penalty. `lagSmoothing(0)` prevents GSAP from throttling updates during
    // long frames (critical for 60+ Hz displays).
    const rafCallback = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(rafCallback);
    gsap.ticker.lagSmoothing(0);

    // Listen for live changes to prefers-reduced-motion (e.g., OS toggle while
    // the app is open) and destroy Lenis if the user opts out.
    let motionMedia: MediaQueryList | null = null;
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
      const onMotionChange = (e: MediaQueryListEvent) => {
        if (e.matches && lenisRef.current) {
          gsap.ticker.remove(rafCallback);
          lenisRef.current.destroy();
          lenisRef.current = null;
          setLenisInstance(null);
          delete (window as unknown as { __lenis?: Lenis }).__lenis;
        }
      };
      motionMedia.addEventListener('change', onMotionChange);
    }

    return () => {
      gsap.ticker.remove(rafCallback);
      lenis.destroy();
      lenisRef.current = null;
      setLenisInstance(null);
      if (typeof window !== 'undefined') {
        delete (window as unknown as { __lenis?: Lenis }).__lenis;
      }
    };
  }, []);

  return (
    <SmoothScrollContext.Provider value={{ lenis: lenisInstance }}>
      {children}
    </SmoothScrollContext.Provider>
  );
}

/**
 * Returns the live Lenis instance created by the nearest `SmoothScrollProvider`.
 * Returns `null` when reduced-motion is active or before the provider mounts.
 */
export function useSmoothScroll(): SmoothScrollContextValue {
  return useContext(SmoothScrollContext);
}
