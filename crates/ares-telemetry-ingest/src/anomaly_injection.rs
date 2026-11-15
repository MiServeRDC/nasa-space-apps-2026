//! Deterministic synthetic anomaly injection on top of recorded BIDMC rows.
//!
//! Used by the offline evaluation harness and by the live demo endpoint. An
//! injected row is no longer a pure recording: callers must tag it as simulated.
//! The profiles are additive offsets on the recorded signal (its real noise is
//! kept) and do not model physiological coupling between channels.

use crate::bidmc_replayer::BidmcNumericRow;
use serde::{Deserialize, Serialize};

/// Catalogue of injectable events.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InjectedAnomalyKind {
    DesaturationFast,
    DesaturationModerate,
    DesaturationSlow,
    TachycardiaFast,
    TachycardiaModerate,
    TachycardiaSlow,
    CombinedSubtle,
    SensorDetach,
}

/// Trapezoid offset profile: linear ramp, hold, linear recovery.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct InjectionProfile {
    pub delta_hr_bpm: f64,
    pub delta_spo2_pct: f64,
    pub delta_resp_brpm: f64,
    pub ramp_s: f64,
    pub hold_s: f64,
    pub recovery_s: f64,
    /// When true SpO2 and PULSE (same optical probe) are removed instead of offset.
    pub probe_detached: bool,
}

impl InjectedAnomalyKind {
    pub const ALL: [Self; 8] = [
        Self::DesaturationFast,
        Self::DesaturationModerate,
        Self::DesaturationSlow,
        Self::TachycardiaFast,
        Self::TachycardiaModerate,
        Self::TachycardiaSlow,
        Self::CombinedSubtle,
        Self::SensorDetach,
    ];

    pub const fn label(self) -> &'static str {
        match self {
            Self::DesaturationFast => "DESATURATION_FAST",
            Self::DesaturationModerate => "DESATURATION_MODERATE",
            Self::DesaturationSlow => "DESATURATION_SLOW",
            Self::TachycardiaFast => "TACHYCARDIA_FAST",
            Self::TachycardiaModerate => "TACHYCARDIA_MODERATE",
            Self::TachycardiaSlow => "TACHYCARDIA_SLOW",
            Self::CombinedSubtle => "COMBINED_SUBTLE",
            Self::SensorDetach => "SENSOR_DETACH",
        }
    }

    pub const fn description(self) -> &'static str {
        match self {
            Self::DesaturationFast => "SpO2 -8 % (20 s ramp, 60 s hold)",
            Self::DesaturationModerate => "SpO2 -5 % (30 s ramp, 60 s hold)",
            Self::DesaturationSlow => "SpO2 -5 % (120 s ramp, 30 s hold)",
            Self::TachycardiaFast => "HR +35 bpm (15 s ramp, 60 s hold)",
            Self::TachycardiaModerate => "HR +20 bpm (20 s ramp, 60 s hold)",
            Self::TachycardiaSlow => "HR +20 bpm (120 s ramp, 30 s hold)",
            Self::CombinedSubtle => "HR +10 bpm, SpO2 -3 %, RESP +5 brpm (30 s ramp, 90 s hold)",
            Self::SensorDetach => "SpO2 + PULSE probe off for 45 s",
        }
    }

    pub const fn profile(self) -> InjectionProfile {
        const NONE: InjectionProfile = InjectionProfile {
            delta_hr_bpm: 0.0,
            delta_spo2_pct: 0.0,
            delta_resp_brpm: 0.0,
            ramp_s: 0.0,
            hold_s: 0.0,
            recovery_s: 0.0,
            probe_detached: false,
        };
        match self {
            Self::DesaturationFast => InjectionProfile {
                delta_spo2_pct: -8.0,
                ramp_s: 20.0,
                hold_s: 60.0,
                recovery_s: 20.0,
                ..NONE
            },
            Self::DesaturationModerate => InjectionProfile {
                delta_spo2_pct: -5.0,
                ramp_s: 30.0,
                hold_s: 60.0,
                recovery_s: 30.0,
                ..NONE
            },
            Self::DesaturationSlow => InjectionProfile {
                delta_spo2_pct: -5.0,
                ramp_s: 120.0,
                hold_s: 30.0,
                recovery_s: 0.0,
                ..NONE
            },
            Self::TachycardiaFast => InjectionProfile {
                delta_hr_bpm: 35.0,
                ramp_s: 15.0,
                hold_s: 60.0,
                recovery_s: 30.0,
                ..NONE
            },
            Self::TachycardiaModerate => InjectionProfile {
                delta_hr_bpm: 20.0,
                ramp_s: 20.0,
                hold_s: 60.0,
                recovery_s: 20.0,
                ..NONE
            },
            Self::TachycardiaSlow => InjectionProfile {
                delta_hr_bpm: 20.0,
                ramp_s: 120.0,
                hold_s: 30.0,
                recovery_s: 0.0,
                ..NONE
            },
            Self::CombinedSubtle => InjectionProfile {
                delta_hr_bpm: 10.0,
                delta_spo2_pct: -3.0,
                delta_resp_brpm: 5.0,
                ramp_s: 30.0,
                hold_s: 90.0,
                recovery_s: 30.0,
                ..NONE
            },
            Self::SensorDetach => InjectionProfile {
                hold_s: 45.0,
                probe_detached: true,
                ..NONE
            },
        }
    }

    /// Total event duration in seconds (ramp + hold + recovery).
    pub fn duration_s(self) -> f64 {
        let p = self.profile();
        p.ramp_s + p.hold_s + p.recovery_s
    }
}

/// One scheduled event: `kind` starting at `onset_s` on the caller's time base.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct AnomalyInjection {
    pub kind: InjectedAnomalyKind,
    pub onset_s: f64,
}

impl AnomalyInjection {
    #[inline]
    pub fn is_active(&self, t_s: f64) -> bool {
        t_s >= self.onset_s && t_s < self.onset_s + self.kind.duration_s()
    }

    /// Fraction of the full offset applied at `t_s` (0 outside the event).
    pub fn gain(&self, t_s: f64) -> f64 {
        if !self.is_active(t_s) {
            return 0.0;
        }
        let p = self.kind.profile();
        let dt = t_s - self.onset_s;
        if dt < p.ramp_s {
            // The first injected sample already carries a non-zero offset.
            (dt + 1.0) / p.ramp_s.max(1.0)
        } else if dt < p.ramp_s + p.hold_s {
            1.0
        } else {
            1.0 - (dt - p.ramp_s - p.hold_s) / p.recovery_s.max(1.0)
        }
        .clamp(0.0, 1.0)
    }

    /// Returns the row to feed downstream at `t_s`. Recorded missing values stay
    /// missing; injected values are rounded like the integer source and clamped.
    pub fn apply(&self, row: &BidmcNumericRow, t_s: f64) -> BidmcNumericRow {
        let gain = self.gain(t_s);
        if !self.is_active(t_s) {
            return row.clone();
        }
        let p = self.kind.profile();
        let mut out = row.clone();
        if p.probe_detached {
            out.spo2_pct = None;
            out.pulse_bpm = None;
            for name in ["pulse_rate_bpm", "spo2_pct"] {
                if !out.missing_channels.iter().any(|c| c == name) {
                    out.missing_channels.push(name.to_string());
                }
            }
            return out;
        }
        let shift = |v: Option<f64>, delta: f64, lo: f64, hi: f64| {
            v.map(|x| (x + gain * delta).round().clamp(lo, hi))
        };
        if p.delta_hr_bpm != 0.0 {
            out.hr_bpm = shift(row.hr_bpm, p.delta_hr_bpm, 20.0, 240.0);
            out.pulse_bpm = shift(row.pulse_bpm, p.delta_hr_bpm, 20.0, 240.0);
        }
        if p.delta_spo2_pct != 0.0 {
            out.spo2_pct = shift(row.spo2_pct, p.delta_spo2_pct, 50.0, 100.0);
        }
        if p.delta_resp_brpm != 0.0 {
            out.resp_brpm = shift(row.resp_brpm, p.delta_resp_brpm, 2.0, 60.0);
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row() -> BidmcNumericRow {
        BidmcNumericRow {
            record_id: "bidmc_test".to_string(),
            relative_time_s: 0.0,
            hr_bpm: Some(80.0),
            pulse_bpm: Some(79.0),
            resp_brpm: Some(16.0),
            spo2_pct: None,
            missing_channels: vec!["spo2_pct".to_string()],
        }
    }

    #[test]
    fn profile_ramps_holds_recovers_and_leaves_rows_outside_the_event_untouched() {
        let inj = AnomalyInjection {
            kind: InjectedAnomalyKind::TachycardiaFast,
            onset_s: 100.0,
        };
        assert_eq!(inj.apply(&row(), 99.0), row());
        assert_eq!(inj.apply(&row(), 205.0), row());
        assert_eq!(inj.apply(&row(), 100.0).hr_bpm, Some(82.0));
        let hold = inj.apply(&row(), 140.0);
        assert_eq!(hold.hr_bpm, Some(115.0));
        assert_eq!(hold.pulse_bpm, Some(114.0));
        assert_eq!(hold.resp_brpm, Some(16.0));
        let recovering = inj.apply(&row(), 190.0).hr_bpm.unwrap();
        assert!(recovering > 80.0 && recovering < 115.0);
    }

    #[test]
    fn recorded_missing_values_are_never_filled_and_detach_removes_the_probe_channels() {
        let desat = AnomalyInjection {
            kind: InjectedAnomalyKind::DesaturationFast,
            onset_s: 0.0,
        };
        assert_eq!(desat.apply(&row(), 30.0).spo2_pct, None);

        let detach = AnomalyInjection {
            kind: InjectedAnomalyKind::SensorDetach,
            onset_s: 0.0,
        };
        let out = detach.apply(&row(), 10.0);
        assert_eq!((out.spo2_pct, out.pulse_bpm, out.hr_bpm), (None, None, Some(80.0)));
        assert_eq!(out.missing_channels, vec!["spo2_pct", "pulse_rate_bpm"]);
    }
}
