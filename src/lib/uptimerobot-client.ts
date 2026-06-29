/**
 * UptimeRobot API client
 * Docs: https://uptimerobot.com/api
 */

const UPTIMEROBOT_API_URL = 'https://api.uptimerobot.com/v2';

export interface UptimeRobotMonitor {
  id: number;
  friendly_name: string;
  url: string;
  type: number; // 1=HTTP, 3=keyword, etc
  sub_type?: string;
  keyword_type?: number;
  keyword_case_type?: number;
  http_username?: string;
  http_password?: string;
  port?: string;
  interval: number;
  status: number; // 0=paused, 1=not checked yet, 2=up, 8=seems down, 9=down
  create_datetime: number;
  monitor_group?: number;
  is_group_main?: number;
  group_id?: number;
}

export interface UptimeRobotIncident {
  id: number;
  monitor_id: number;
  status: number; // 1=down, 2=up
  ts: number;
  reason?: string;
  duration?: number;
}

export class UptimeRobotClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request(endpoint: string, params: Record<string, any> = {}) {
    const body = new URLSearchParams({
      api_key: this.apiKey,
      format: 'json',
      ...params,
    });

    const res = await fetch(`${UPTIMEROBOT_API_URL}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`UptimeRobot API error: ${res.status}`);
    }

    const data = await res.json();
    if (!data.stat || data.stat !== 'ok') {
      throw new Error(`UptimeRobot API error: ${data.error?.message || 'unknown'}`);
    }

    return data;
  }

  async getMonitors() {
    const res = await this.request('getMonitors', {
      logs: 1,
    });
    return res.monitors as UptimeRobotMonitor[];
  }

  async getMonitor(monitorId: number) {
    const res = await this.request('getMonitors', {
      monitors: monitorId,
      logs: 1,
    });
    return res.monitors[0] as UptimeRobotMonitor;
  }

  async getIncidents(monitorId: number) {
    const res = await this.request('getIncidents', {
      monitors: monitorId,
      limit: 50,
    });
    return res.incidents as UptimeRobotIncident[];
  }

  /**
   * Pause or resume a monitor
   * status: 0 = paused, 1 = resumed
   */
  async setMonitorStatus(monitorId: number, status: 0 | 1) {
    const res = await this.request('editMonitor', {
      id: monitorId,
      status: status,
    });
    return res;
  }
}
