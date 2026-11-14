// ARES-Health Universal Wearable Ingestion: Web Bluetooth GATT HRP (0x180D)
// Standard: Bluetooth SIG Heart Rate Profile (0x180D) & Measurement (0x2A37)
// Hardware Agnostic: Works with Polar H10, Movesense, Garmin, Wahoo, Scosche, or any standard BLE monitor
// Calculates real-time Heart Rate Variability (RMSSD, SDNN, pNN50) from raw RR-intervals when broadcast.

export interface BleHeartRateMeasurement {
  heartRateBpm: number;
  contactDetected: boolean | null;
  energyExpendedJoules?: number;
  rrIntervalsMs: number[];
  rmssdMs?: number;
  sdnnMs?: number;
  pnn50Pct?: number;
  deviceName: string;
}

export type BleStatus = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'UNSUPPORTED' | 'ERROR';

export class UniversalBleHeartRateManager {
  private device: any | null = null;
  private server: any | null = null;
  private characteristic: any | null = null;
  private rrRollingWindow: number[] = [];
  private onMeasurementCb?: (m: BleHeartRateMeasurement) => void;
  private onStatusCb?: (status: BleStatus, err?: string) => void;

  public static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  public setCallbacks(
    onMeasurement: (m: BleHeartRateMeasurement) => void,
    onStatus: (status: BleStatus, err?: string) => void
  ) {
    this.onMeasurementCb = onMeasurement;
    this.onStatusCb = onStatus;
  }

  public async connect(): Promise<void> {
    if (!UniversalBleHeartRateManager.isSupported()) {
      this.onStatusCb?.('UNSUPPORTED', 'Web Bluetooth is not supported in this browser. Use Chrome, Edge, or Opera.');
      return;
    }

    try {
      this.onStatusCb?.('CONNECTING');
      const nav = navigator as any;

      this.device = await nav.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }],
        optionalServices: ['battery_service', 'device_information'],
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        this.onStatusCb?.('DISCONNECTED');
      });

      this.server = await this.device.gatt.connect();
      const service = await this.server.getPrimaryService('heart_rate');
      this.characteristic = await service.getCharacteristic('heart_rate_measurement');

      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', (e: any) => {
        this.parseMeasurement(e.target.value);
      });

      this.onStatusCb?.('CONNECTED');
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        this.onStatusCb?.('IDLE'); // User cancelled picker
      } else {
        this.onStatusCb?.('ERROR', err.message || 'BLE Connection failed');
      }
    }
  }

  public disconnect(): void {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.rrRollingWindow = [];
    this.onStatusCb?.('DISCONNECTED');
  }

  private parseMeasurement(value: DataView): void {
    const flags = value.getUint8(0);
    const hr16Bit = (flags & 0x01) !== 0;
    const contactSupported = (flags & 0x04) !== 0;
    const contactDetected = contactSupported ? (flags & 0x02) !== 0 : null;
    const energyPresent = (flags & 0x08) !== 0;
    const rrPresent = (flags & 0x10) !== 0;

    let offset = 1;
    let heartRateBpm = 0;
    if (hr16Bit) {
      heartRateBpm = value.getUint16(offset, true);
      offset += 2;
    } else {
      heartRateBpm = value.getUint8(offset);
      offset += 1;
    }

    let energyExpendedJoules: number | undefined;
    if (energyPresent) {
      energyExpendedJoules = value.getUint16(offset, true);
      offset += 2;
    }

    const newRrsMs: number[] = [];
    if (rrPresent) {
      while (offset + 1 < value.byteLength) {
        // RR-Interval units are 1/1024 of a second (~0.9765625 ms)
        const raw = value.getUint16(offset, true);
        const ms = (raw / 1024) * 1000;
        newRrsMs.push(Math.round(ms));
        offset += 2;
      }
    }

    // Maintain rolling buffer of last 60 RR intervals for HRV metrics
    if (newRrsMs.length > 0) {
      this.rrRollingWindow.push(...newRrsMs);
      if (this.rrRollingWindow.length > 120) {
        this.rrRollingWindow = this.rrRollingWindow.slice(-120);
      }
    }

    // Calculate real-time HRV if sufficient intervals
    let rmssdMs: number | undefined;
    let sdnnMs: number | undefined;
    let pnn50Pct: number | undefined;

    if (this.rrRollingWindow.length >= 8) {
      const rrs = this.rrRollingWindow;
      const n = rrs.length;

      // Mean RR
      const mean = rrs.reduce((a, b) => a + b, 0) / n;

      // SDNN
      const variance = rrs.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (n - 1);
      sdnnMs = Math.round(Math.sqrt(variance));

      // RMSSD & pNN50
      let sumDiffSq = 0;
      let countDiffGt50 = 0;
      for (let i = 0; i < n - 1; i++) {
        const diff = Math.abs(rrs[i + 1] - rrs[i]);
        sumDiffSq += diff * diff;
        if (diff > 50) countDiffGt50++;
      }
      rmssdMs = Math.round(Math.sqrt(sumDiffSq / (n - 1)));
      pnn50Pct = Math.round((countDiffGt50 / (n - 1)) * 100);
    }

    const measurement: BleHeartRateMeasurement = {
      heartRateBpm,
      contactDetected,
      energyExpendedJoules,
      rrIntervalsMs: newRrsMs,
      rmssdMs,
      sdnnMs,
      pnn50Pct,
      deviceName: this.device?.name || 'Standard BLE Heart Rate Monitor',
    };

    this.onMeasurementCb?.(measurement);
  }
}
