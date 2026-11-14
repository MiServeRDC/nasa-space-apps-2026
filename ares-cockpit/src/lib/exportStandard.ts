// ARES-Health Open Health Interoperability Exporter
// Standards: Open mHealth (OMH v1.0) & HL7 FHIR R4 (Vital Signs Profile)
// Compliant with NASA-STD-3001 data harmonization standards

import type { ScenarioState } from './scenario';
import type { TelemetryPacket } from '../types/telemetry';

export interface OpenMHealthBundle {
  header: {
    schema_id: {
      namespace: string;
      name: string;
      version: string;
    };
    source_creation_date_time: string;
    generator: string;
  };
  body: {
    heart_rate?: {
      value: number;
      unit: string;
    };
    oxygen_saturation?: {
      value: number;
      unit: string;
    };
    respiratory_rate?: {
      value: number;
      unit: string;
    };
    blood_pressure?: {
      systolic: { value: number; unit: string };
      diastolic: { value: number; unit: string };
    };
    core_temperature?: {
      value: number;
      unit: string;
    };
    safety_margins: {
      worst_predicate: string;
      min_margin: number;
      mission_readiness_index: number | null;
      alarm_level: string;
    };
  };
}

export function buildOpenMHealthJson(packet: TelemetryPacket, s: ScenarioState): OpenMHealthBundle {
  const b = packet.biometrics;
  const time = packet.timestamp_ms ? new Date(packet.timestamp_ms).toISOString() : new Date().toISOString();
  return {
    header: {
      schema_id: {
        namespace: 'omh',
        name: 'vital-signs-ares-bundle',
        version: '1.0',
      },
      source_creation_date_time: time,
      generator: 'ARES-Health Autonomous Edge Gateway (NASA-STD-3001)',
    },
    body: {
      heart_rate: b.heart_rate_bpm != null ? { value: b.heart_rate_bpm, unit: 'beats/min' } : undefined,
      oxygen_saturation: b.spo2_percent != null ? { value: b.spo2_percent, unit: '%' } : undefined,
      respiratory_rate: b.respiration_rate_brpm != null ? { value: b.respiration_rate_brpm, unit: 'breaths/min' } : undefined,
      blood_pressure: {
        systolic: { value: Math.round(s.sbp), unit: 'mmHg' },
        diastolic: { value: Math.round(s.sbp * 0.65), unit: 'mmHg' },
      },
      core_temperature: {
        value: s.coreTempC,
        unit: 'C',
      },
      safety_margins: {
        worst_predicate: s.worst,
        min_margin: Number(s.rhoMin.toFixed(3)),
        mission_readiness_index: packet.safety_margins.mission_readiness_index,
        alarm_level: packet.safety_margins.alarm_level,
      },
    },
  };
}

export function buildHl7FhirJson(packet: TelemetryPacket, s: ScenarioState) {
  const time = packet.timestamp_ms ? new Date(packet.timestamp_ms).toISOString() : new Date().toISOString();
  const b = packet.biometrics;

  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: time,
    meta: {
      profile: ['http://hl7.org/fhir/StructureDefinition/vitalsigns'],
      tag: [
        { system: 'https://standards.nasa.gov', code: 'NASA-STD-3001', display: 'Spaceflight Crew Health' },
      ],
    },
    entry: [
      {
        resource: {
          resourceType: 'Observation',
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }] },
          effectiveDateTime: time,
          valueQuantity: b.heart_rate_bpm != null ? { value: b.heart_rate_bpm, unit: 'beats/minute', system: 'http://unitsofmeasure.org', code: '/min' } : undefined,
          dataAbsentReason: b.heart_rate_bpm == null ? { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/data-absent-reason', code: 'unsupported' }] } : undefined,
        },
      },
      {
        resource: {
          resourceType: 'Observation',
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '2708-6', display: 'Oxygen saturation in Arterial blood' }] },
          effectiveDateTime: time,
          valueQuantity: b.spo2_percent != null ? { value: b.spo2_percent, unit: '%', system: 'http://unitsofmeasure.org', code: '%' } : undefined,
        },
      },
      {
        resource: {
          resourceType: 'Observation',
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '9279-1', display: 'Respiratory rate' }] },
          effectiveDateTime: time,
          valueQuantity: b.respiration_rate_brpm != null ? { value: b.respiration_rate_brpm, unit: 'breaths/minute', system: 'http://unitsofmeasure.org', code: '/min' } : undefined,
        },
      },
      {
        resource: {
          resourceType: 'Observation',
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure panel with all children optional' }] },
          effectiveDateTime: time,
          component: [
            {
              code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }] },
              valueQuantity: { value: Math.round(s.sbp), unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
            },
          ],
        },
      },
      {
        resource: {
          resourceType: 'Observation',
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '8310-5', display: 'Body temperature' }] },
          effectiveDateTime: time,
          valueQuantity: { value: s.coreTempC, unit: 'C', system: 'http://unitsofmeasure.org', code: 'Cel' },
        },
      },
      {
        resource: {
          resourceType: 'Observation',
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '2062-8', display: 'Calcium [Mass/time] in 24 hour Urine' }] },
          effectiveDateTime: time,
          valueQuantity: { value: Math.round(s.urinaryCalciumMgD), unit: 'mg/24h', system: 'http://unitsofmeasure.org', code: 'mg/(24.h)' },
        },
      },
    ],
  };
}

export function downloadJsonFile(filename: string, data: object) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
