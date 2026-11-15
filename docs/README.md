# ARES-Health documentation

Start with the [judge walkthrough](submission/JUDGES_START_HERE.md) and the
[local launch instructions](../README.md#run-the-demo).

| Question | Reference |
| --- | --- |
| What was verified for the demo? | [Release verification](evaluation/JUDGES_HANDOFF_READINESS.md) |
| Which signals come from recordings, and which are simulated? | [Model evidence audit](architecture/MODEL_EVIDENCE_AUDIT.md) and [BIDMC data provenance](../data/bidmc/README.md) |
| How is the system organized? | [Architecture overview](architecture/CRATES_AND_MODULES_BLUEPRINT.md) |
| Where are the sources and attribution? | [References](REFERENCES.md), [anatomical atlas attribution](../ares-cockpit/public/anatomy/ATTRIBUTION-PAIRED.md) and [software licensing](../README.md#9-compliance-licensing--clean-room-mandate) |
| How do I package or deploy the demo? | [Packaging and deployment](../deploy/judges/README.md) |

## Development dossier and records

The numbered files at the repository root are development dossiers. The
early architecture studies, prompts and draft submission copy preserve the
design history. The walkthrough and evidence audit describe the current release.
The [language audit](evaluation/REPOSITORY_LANGUAGE_AUDIT.md) tracks historical
material retained in Italian. Engineering work logs are in `memory-bank/`.
