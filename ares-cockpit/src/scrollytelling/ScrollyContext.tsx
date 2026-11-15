// Scrollytelling state: active chapter (1..5), overall scroll progress (0..1),
// and interactive camera enable/disable toggle for Chapter 3.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** Narrative chapter index (1 = Hero/Descent, ..., 5 = Clinical Decision). */
export type ScrollyChapter = 1 | 2 | 3 | 4 | 5;

export interface ScrollyState {
  /** Currently visible chapter (1..5). */
  activeChapter: ScrollyChapter;
  /** Normalized scroll progress across the entire scrollytelling section [0..1]. */
  scrollProgress: number;
  /**
   * Whether the 3D stage should accept pointer events (orbit + click).
   * True only while Chapter 3 (Interactive Explorer) is active.
   */
  interactiveCameraEnabled: boolean;
}

export interface ScrollyActions {
  setActiveChapter: (chapter: ScrollyChapter) => void;
  setScrollProgress: (progress: number) => void;
  setInteractiveCameraEnabled: (enabled: boolean) => void;
}

export type ScrollyContextValue = ScrollyState & ScrollyActions;

const ScrollyContext = createContext<ScrollyContextValue | null>(null);

export function ScrollyProvider({ children }: { children: ReactNode }) {
  const [activeChapter, setActiveChapterState] = useState<ScrollyChapter>(1);
  const [scrollProgress, setScrollProgressState] = useState<number>(0);
  const [interactiveCameraEnabled, setInteractiveCameraEnabledState] =
    useState<boolean>(false);

  const setActiveChapter = useCallback((chapter: ScrollyChapter) => {
    setActiveChapterState(chapter);
    // Chapter 3 is the Interactive Explorer: enable orbit + click.
    setInteractiveCameraEnabledState(chapter === 3);
  }, []);

  const setScrollProgress = useCallback((progress: number) => {
    // Clamp to [0, 1] for safety.
    setScrollProgressState(Math.max(0, Math.min(1, progress)));
  }, []);

  const setInteractiveCameraEnabled = useCallback((enabled: boolean) => {
    setInteractiveCameraEnabledState(enabled);
  }, []);

  const value = useMemo<ScrollyContextValue>(
    () => ({
      activeChapter,
      scrollProgress,
      interactiveCameraEnabled,
      setActiveChapter,
      setScrollProgress,
      setInteractiveCameraEnabled,
    }),
    [
      activeChapter,
      scrollProgress,
      interactiveCameraEnabled,
      setActiveChapter,
      setScrollProgress,
      setInteractiveCameraEnabled,
    ],
  );

  return (
    <ScrollyContext.Provider value={value}>{children}</ScrollyContext.Provider>
  );
}

/** Returns the scrollytelling context. Must be used inside a `ScrollyProvider`. */
export function useScrollyContext(): ScrollyContextValue {
  const ctx = useContext(ScrollyContext);
  if (ctx === null) {
    throw new Error('useScrollyContext must be used within a ScrollyProvider');
  }
  return ctx;
}
