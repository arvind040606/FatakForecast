// =========================================================================
// FATAKFORECAST — DECOMMISSIONED RAILRADAR TELEMETRY SERVICE (STUB)
// RailRadar has been permanently eliminated from FatakForecast.
// Active telemetry is powered exclusively by RailKit SDK (railkitService.js).
// =========================================================================

export { STATION_COORDINATES } from './stationCoordinates.js';

export class TelemetryService {
  constructor() {
    this.status = 'DECOMMISSIONED';
    this.provider = 'DECOMMISSIONED';
    this.validatedTrainsMap = new Map();
    this.pollingIntervalMs = 0;
    this.timer = null;
  }

  async fetchTrainLive() {
    return {
      success: false,
      error: 'RailRadar has been permanently decommissioned. Telemetry is routed via RailKit SDK (railkitService.js).'
    };
  }

  async pollLiveProvider() {
    return {
      success: false,
      reason: 'RailRadar has been permanently decommissioned. Telemetry is routed via RailKit SDK (railkitService.js).'
    };
  }

  getTrainsList(scheduledBaseline = []) {
    return scheduledBaseline;
  }

  getTrainSchedule() {
    return [];
  }

  startPolling() {}
  stopPolling() {}
}

export const telemetryService = new TelemetryService();
