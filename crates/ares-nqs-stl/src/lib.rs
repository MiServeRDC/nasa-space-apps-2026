//! `ares-nqs-stl` — Blocco D (Fasi 08 D1, 09 D2):
//! Semantica quantitativa normalizzata per la Signal Temporal Logic (`NQS-STL`),
//! filtro di minimo mobile `O(1)` a cuneo monotono di Lemire-Donzé,
//! predittore `Time-To-Violation` (`TTV` con banda di confidenza `±1.96σ` EWMA-OLS)
//! e sintetizzatore del `Mission Readiness Index` (`MRI %`).

pub mod mri_index;
pub mod normalizer;
pub mod sliding_window;
pub mod ttv_predictor;
