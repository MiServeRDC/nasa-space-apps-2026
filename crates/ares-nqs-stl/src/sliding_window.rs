//! Phase 08 (D1): O(1) sliding-minimum filter based on the Lemire-Donze monotonic wedge (Invariant Entry 007).

use ares_core_types::constants::sanitize_f64;
use std::collections::VecDeque;

/// Lemire monotonic wedge for evaluating the STL operator Box_[t-W, t] in amortized O(1) time.
#[derive(Debug, Clone)]
pub struct LemireMinWedge {
    window_duration_s: f64,
    deque: VecDeque<(f64, f64)>,
}

impl LemireMinWedge {
    pub fn new(window_duration_s: f64) -> Self {
        Self {
            window_duration_s: window_duration_s.max(1.0),
            deque: VecDeque::with_capacity(64),
        }
    }

    /// Inserts a new sample `(time_s, rho)` and returns `min_{tau in [t-W, t]} rho(tau)` in O(1).
    #[inline]
    pub fn push_and_evaluate(&mut self, time_s: f64, rho: f64) -> f64 {
        let t = sanitize_f64(time_s, 0.0);
        let v = sanitize_f64(rho, 0.0);

        // If time resets (e.g. BIDMC replay loop or scenario change), empty the window
        if let Some(&(last_t, _)) = self.deque.back()
            && t < last_t
        {
            self.deque.clear();
        }

        // Removes from the tail all elements >= v (maintaining strict monotonicity)
        while let Some(&(_, back_val)) = self.deque.back() {
            if back_val >= v {
                self.deque.pop_back();
            } else {
                break;
            }
        }
        self.deque.push_back((t, v));

        // Removes from the head the elements that have left the horizon [t - W, t]
        let cutoff = t - self.window_duration_s;
        while let Some(&(front_t, _)) = self.deque.front() {
            if front_t < cutoff {
                self.deque.pop_front();
            } else {
                break;
            }
        }

        self.deque.front().map(|&(_, min_v)| min_v).unwrap_or(v)
    }

    #[inline]
    pub fn clear(&mut self) {
        self.deque.clear();
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.deque.len()
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.deque.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lemire_monotonic_wedge_matches_exact_sliding_minimum() {
        let window_s = 60.0;
        let mut wedge = LemireMinWedge::new(window_s);
        let mut history: Vec<(f64, f64)> = Vec::with_capacity(481);

        for i in 0..481 {
            let t = i as f64;
            let val = 0.45 * (0.07 * t).sin() + 0.25 * (0.23 * t).cos() - 0.0005 * t;
            history.push((t, val));

            let fast_min = wedge.push_and_evaluate(t, val);
            let cutoff = t - window_s;
            let naive_min = history
                .iter()
                .filter(|&&(tau, _)| tau >= cutoff && tau <= t)
                .map(|&(_, v)| v)
                .fold(f64::INFINITY, f64::min);

            assert!(
                (fast_min - naive_min).abs() < 1e-15,
                "Mismatch at t={}: fast={} vs naive={}",
                t,
                fast_min,
                naive_min
            );
        }

        // Verify auto-reset on temporal rewind (t = 0.0 < 480.0)
        let reset_val = wedge.push_and_evaluate(0.0, 0.88);
        assert!((reset_val - 0.88).abs() < 1e-15);
        assert_eq!(wedge.len(), 1);
    }
}
