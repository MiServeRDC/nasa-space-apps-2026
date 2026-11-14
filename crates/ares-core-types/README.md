# `ares-core-types` — Shared Telemetry Contracts, Physical Units & Privacy Traits

> Evidence status (#12): model outputs are illustrative/unvalidated. Historical calibrated-confidence, clinical-probability, certification and readiness claims are superseded by [the evidence audit](../../docs/architecture/MODEL_EVIDENCE_AUDIT.md). Numerical gate acceptance is heuristic.

**Assigned Owner:** `@fabiomalagutti27-droid` & `@MiServeRDC` (`work/fabiomalagutti27-droid`)  

## Scope
1. Rust data structures (`AstronautTelemetryFrame`, `CardiovascularMetrics`, `MusculoskeletalMetrics`, `NeuroOcularMetrics`, `HabitatAvionicsMetrics`, `BehavioralVocalMetrics`) matching `contracts/telemetry_schema.json` 1:1.
2. `NASA-STD-3001` Volume 1 Rev C (`[V1 3001]–[V1 4001]`) and Volume 2 Rev F (`[V2 6001]–[V2 10001]`) boundary constants.
3. Abstract traits for `CrewPrivacyFilter` (`PrivateAstronautView`, `CmoMedicalView`, `FlightSurgeonStoreAndForwardPacket`) and `MedOpsAuditLogger`.
