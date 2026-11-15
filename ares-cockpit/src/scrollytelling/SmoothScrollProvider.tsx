import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export interface ScrollProgressState {
  progress: number;
  scrollY: number;
  activeChapter: number;
  totalChapters: number;
}

interface SmoothScrollContextValue {
  lenis: Lenis | null;
  activeChapter: number;
  scrollProgressRef: React.MutableRefObject<ScrollProgressState>;
  scrollToChapter: (chapterIndex: number) => void;
  scrollToId: (targetId: string) => void;
}

const SmoothScrollContext = createContext<SmoothScrollContextValue | null>(null);

export function useSmoothScroll(): SmoothScrollContextValue {
  const ctx = useContext(SmoothScrollContext);
  if (!ctx) {
    throw new Error('useSmoothScroll must be used within SmoothScrollProvider');
  }
  return ctx;
}

export interface SmoothScrollProviderProps {
  children: React.ReactNode;
  chapterCount?: number;
  onChapterChange?: (chapterIndex: number) => void;
}

export function SmoothScrollProvider({
  children,
  chapterCount = 5,
  onChapterChange,
}: SmoothScrollProviderProps) {
  const [activeChapter, setActiveChapter] = useState<number>(0);
  const activeChapterRef = useRef<number>(0);
  const lenisRef = useRef<Lenis | null>(null);

  const scrollProgressRef = useRef<ScrollProgressState>({
    progress: 0,
    scrollY: 0,
    activeChapter: 0,
    totalChapters: chapterCount,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const lenis = new Lenis({
      duration: prefersReducedMotion ? 0.01 : 1.25,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: !prefersReducedMotion,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.8,
      infinite: false,
    });

    lenisRef.current = lenis;

    // Connect Lenis scroll event to GSAP ScrollTrigger
    lenis.on('scroll', (e: { progress: number; scroll: number }) => {
      ScrollTrigger.update();
      scrollProgressRef.current.progress = e.progress;
      scrollProgressRef.current.scrollY = e.scroll;

      // Calculate chapter based on scroll progress (0..1)
      const clampedProg = Math.max(0, Math.min(1, e.progress));
      const calculatedChapter = Math.min(chapterCount - 1, Math.floor(clampedProg * chapterCount));

      scrollProgressRef.current.activeChapter = calculatedChapter;

      // Discrete state update ONLY when chapter changes to avoid 60fps React re-renders
      if (calculatedChapter !== activeChapterRef.current) {
        activeChapterRef.current = calculatedChapter;
        setActiveChapter(calculatedChapter);
        onChapterChange?.(calculatedChapter);
      }
    });

    // Hook Lenis into GSAP ticker
    const updateGsapTicker = (time: number) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(updateGsapTicker);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(updateGsapTicker);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [chapterCount, onChapterChange]);

  const scrollToChapter = useCallback(
    (chapterIndex: number) => {
      const targetId = `#chapter-${chapterIndex}`;
      const elem = document.querySelector(targetId);
      if (elem && lenisRef.current) {
        lenisRef.current.scrollTo(elem as HTMLElement, { offset: 0, duration: 1.2 });
      }
    },
    [],
  );

  const scrollToId = useCallback((targetId: string) => {
    const elem = document.querySelector(targetId);
    if (elem && lenisRef.current) {
      lenisRef.current.scrollTo(elem as HTMLElement, { offset: 0, duration: 1.2 });
    }
  }, []);

  const value = {
    lenis: lenisRef.current,
    activeChapter,
    scrollProgressRef,
    scrollToChapter,
    scrollToId,
  };

  return (
    <SmoothScrollContext.Provider value={value}>
      {children}
    </SmoothScrollContext.Provider>
  );
}
