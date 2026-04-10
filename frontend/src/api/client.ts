const BASE = "/api";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  summary: () => req<Summary>("/summary"),

  // Wazuh
  wazuhAlerts: (params: AlertParams = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set("limit", String(params.limit));
    if (params.offset) q.set("offset", String(params.offset));
    if (params.severity) q.set("severity", params.severity);
    if (params.agent) q.set("agent", params.agent);
    if (params.rule_id) q.set("rule_id", params.rule_id);
    if (params.hours_back) q.set("hours_back", String(params.hours_back));
    return req<AlertsResponse>(`/wazuh/alerts?${q}`);
  },
  wazuhNoisyRules: (hours_back = 24) => req<NoisyRule[]>(`/wazuh/noisy-rules?hours_back=${hours_back}`),
  wazuhAgentAlertSummary: (hours_back = 24) => req<AgentAlertSummary[]>(`/wazuh/agent-alert-summary?hours_back=${hours_back}`),
  wazuhAgents: () => req<WazuhAgent[]>("/wazuh/agents"),
  wazuhAlertVolume: (timeframe: string) =>
    req<AlertBucket[]>(`/wazuh/alert-volume?timeframe=${timeframe}`),
  refreshWazuh: () => req("/wazuh/refresh", { method: "POST" }),

  // NinjaOne
  ninjaDevices: () => req<NinjaDevice[]>("/ninja/devices"),
  ninjaPatches: () => req<PatchSummary>("/ninja/patches"),
  ninjaActivities: (params: ActivityParams = {}) => {
    const q = new URLSearchParams();
    if (params.device_id) q.set("device_id", params.device_id);
    if (params.activity_type) q.set("activity_type", params.activity_type);
    return req<NinjaActivity[]>(`/ninja/activities?${q}`);
  },
  refreshNinja: () => req("/ninja/refresh", { method: "POST" }),
};

// Types
export interface Summary {
  wazuh: WazuhSummary | null;
  wazuh_error: string | null;
  ninja: NinjaSummary | null;
  ninja_error: string | null;
}

export interface WazuhSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface NinjaSummary {
  total: number;
  online: number;
  offline: number;
}

export interface AlertParams {
  limit?: number;
  offset?: number;
  severity?: string;
  agent?: string;
  rule_id?: string;
  hours_back?: number;
}

export interface WazuhAlert {
  id: string;
  timestamp: string;
  agent?: { id?: string; name?: string; ip?: string };
  manager?: { name?: string };
  decoder?: { name?: string };
  input?: { type?: string };
  location?: string;
  rule?: {
    id?: string;
    description?: string;
    level?: number;
    groups?: string[];
    firedtimes?: number;
    mail?: boolean;
    mitre?: { technique?: string[]; id?: string[]; tactic?: string[] };
    pci_dss?: string[];
    nist_800_53?: string[];
    gdpr?: string[];
    tsc?: string[];
    cis?: string[];
    cis_csc_v8?: string[];
    cis_csc_v7?: string[];
    hipaa?: string[];
  };
  data?: {
    win?: {
      eventdata?: Record<string, string>;
      system?: {
        eventID?: string;
        message?: string;
        channel?: string;
        computer?: string;
        providerName?: string;
        severityValue?: string;
        eventRecordID?: string;
        [key: string]: string | undefined;
      };
    };
    sca?: {
      type?: string;
      policy?: string;
      policy_id?: string;
      score?: string;
      passed?: string;
      failed?: string;
      total_checks?: string;
      check?: {
        id?: string | number;
        title?: string;
        description?: string;
        rationale?: string;
        remediation?: string;
        result?: string;
        previous_result?: string;
        references?: string;
        command?: string[];
        compliance?: Record<string, unknown>;
      };
    };
    [key: string]: unknown;
  };
  count?: number;
}

export interface AlertsResponse {
  total: number;
  alerts: WazuhAlert[];
  source?: "manager_stats" | "indexer";
}

export interface AgentAlertSummary {
  agent_name: string;
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  latest: {
    description?: string;
    timestamp?: string;
    level?: number;
  } | null;
}

export interface NoisyRule {
  rule_id: string;
  description: string;
  level: number;
  severity: string;
  alert_count: number;
  last_triggered: string;
}

export interface WazuhAgent {
  id: string;
  name: string;
  ip: string;
  status: string;
  lastKeepAlive: string;
  os?: { name?: string; platform?: string };
  version?: string;
}

export interface AlertBucket {
  time: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface NinjaDevice {
  id: number;
  systemName?: string;
  displayName?: string;
  offline?: boolean;        // NinjaOne: false = online, true = offline
  lastContact?: number;     // Unix seconds
  lastSeenAt?: number;
  lastLoggedOnUser?: string;
  os?: { name?: string; manufacturer?: string };
  system?: { cpuUsage?: number; cpuCount?: number; totalPhysicalMemory?: number; name?: string; manufacturer?: string; model?: string };
  memory?: { capacity?: number };
  processors?: { name?: string; numCores?: number; architecture?: string }[];
  nodeClass?: string;
  ipAddresses?: string[];
}

export interface PatchSummary {
  total_devices: number;
  fully_patched: number;
  patches_pending: number;
  patches_failed: number;
  patch_details: PatchDetail[];
}

export interface PatchDetail {
  deviceId: number;
  name?: string;
  identifier?: string;
  status: string;
  severity?: string;
  type?: string;
  installedAt?: string;
}

export interface NinjaActivity {
  id: number;
  deviceId?: number;
  activityType?: string;
  message?: string;
  createTime?: number;
  severity?: string;
  device?: { systemName?: string };
}

export interface ActivityParams {
  device_id?: string;
  activity_type?: string;
}
