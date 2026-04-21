const BASE = "/api";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem("auth_token");
    window.location.reload();
  }
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
  wazuhRuleBreakdown: (rule_id: string, hours_back = 24) =>
    req<RuleBreakdown>(`/wazuh/rule-breakdown?rule_id=${encodeURIComponent(rule_id)}&hours_back=${hours_back}`),
  wazuhRuleDimensionDetail: (rule_id: string, field: string, value: string, hours_back = 24) =>
    req<DimensionDetail>(`/wazuh/rule-dimension-detail?rule_id=${encodeURIComponent(rule_id)}&field=${encodeURIComponent(field)}&value=${encodeURIComponent(value)}&hours_back=${hours_back}`),
  wazuhRuleDetail: (rule_id: string) =>
    req<WazuhRuleDetail>(`/wazuh/rule-detail?rule_id=${encodeURIComponent(rule_id)}`),
  wazuhRuleTrend: (rule_id: string) =>
    req<RuleTrend>(`/wazuh/rule-trend?rule_id=${encodeURIComponent(rule_id)}`),
  wazuhAgentAlertSummary: (hours_back = 24) => req<AgentAlertSummary[]>(`/wazuh/agent-alert-summary?hours_back=${hours_back}`),
  wazuhAgents: () => req<WazuhAgent[]>("/wazuh/agents"),
  wazuhRestartAgent: (agentId: string) => req(`/wazuh/agents/${encodeURIComponent(agentId)}/restart`, { method: "POST" }),
  suppressionLog: () => req<SuppressionLogEntry[]>("/wazuh/suppression-log"),
  addSuppressionLog: (e: NewSuppressionLog) => req<SuppressionLogEntry>("/wazuh/suppression-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(e),
  }),
  changelog: () => req<SuppressionLogEntry[]>("/changelog"),
  addChangelogEntry: (e: NewSuppressionLog) => req<SuppressionLogEntry>("/changelog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(e),
  }),
  config: () => req<{ ninja_web_url: string }>("/config"),
  getThreatIntelCves: (params: { days_back?: number; severity?: string; keyword?: string; device_filter?: boolean }) => {
    const q = new URLSearchParams();
    if (params.days_back)    q.set("days_back",     String(params.days_back));
    if (params.severity)     q.set("severity",      params.severity);
    if (params.keyword)      q.set("keyword",       params.keyword);
    if (params.device_filter) q.set("device_filter", "true");
    return req<ThreatIntelResponse>(`/threat-intel/cves?${q}`);
  },
  refreshThreatIntel: () => req<{ status: string }>("/threat-intel/refresh", { method: "POST" }),
  getSettings: () => req<AppSettings>("/settings"),
  saveSettings: (s: AppSettings) => req<{ ok: boolean }>("/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(s),
  }),
  testWazuhConnection: () => req<ConnectionTestResult>("/test-connection/wazuh", { method: "POST" }),
  testNinjaConnection: () => req<ConnectionTestResult>("/test-connection/ninja", { method: "POST" }),
  sendTestEmail: (to: string) => req<{ ok: boolean }>("/email/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to }),
  }),
  sendInviteEmail: (username: string, to: string, password: string, dashboard_url?: string) =>
    req<{ ok: boolean }>(`/auth/users/${encodeURIComponent(username)}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, password, dashboard_url: dashboard_url ?? "" }),
    }),
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

  // Auth
  authMe: () => req<{ username: string; role: string }>("/auth/me"),
  authListUsers: () => req<UserAccount[]>("/auth/users"),
  authCreateUser: (body: { username: string; password: string; role: string }) =>
    req<UserAccount>("/auth/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  authDeleteUser: (username: string) =>
    req<{ ok: boolean }>(`/auth/users/${encodeURIComponent(username)}`, { method: "DELETE" }),
  authAdminResetPassword: (username: string, new_password: string) =>
    req<{ ok: boolean }>(`/auth/users/${encodeURIComponent(username)}/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_password }),
    }),
  authChangeOwnPassword: (current_password: string, new_password: string) =>
    req<{ ok: boolean }>("/auth/me/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password, new_password }),
    }),
};

// Types
export interface UserAccount {
  id: number;
  username: string;
  role: string;
  created_at: string;
}

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

export interface RuleBreakdownBucket { value: string; count: number; }

export interface AlertSample {
  timestamp?:                   string;
  agent_name?:                  string;
  agent_ip?:                    string;
  agent_id?:                    string;
  manager_name?:                string;
  rule_description?:            string;
  rule_level?:                  number;
  rule_groups?:                 string[];
  mitre_ids?:                   string[];
  mitre_techniques?:            string[];
  mitre_tactics?:               string[];
  decoder?:                     string;
  location?:                    string;
  // FIM / syscheck fields
  syscheck_path?:               string;
  syscheck_event?:              string;
  syscheck_value_name?:         string;
  syscheck_value_type?:         string;
  syscheck_changed_attributes?: string[] | string;
  syscheck_content_changes?:    string;
  syscheck_sha1_before?:        string;
  syscheck_sha1_after?:         string;
  syscheck_md5_before?:         string;
  syscheck_md5_after?:          string;
  syscheck_size_before?:        string | number;
  syscheck_size_after?:         string | number;
  syscheck_mtime_after?:        string | number;
  syscheck_uname_after?:        string;
  syscheck_perm_after?:         string;
  // Windows event fields
  event_id?:       string;
  channel?:        string;
  message?:        string;
  provider?:       string;
  user?:           string;
  tgt_user?:       string;
  src_ip?:         string;
  srcuser?:        string;
}

export interface DimensionDetail {
  total:                  number;
  by_agent:               RuleBreakdownBucket[];
  by_syscheck_event:      RuleBreakdownBucket[];
  by_syscheck_path:       RuleBreakdownBucket[];
  by_value_name:          RuleBreakdownBucket[];
  by_value_type:          RuleBreakdownBucket[];
  by_changed_attributes:  RuleBreakdownBucket[];
  by_user:                RuleBreakdownBucket[];
  by_event_id:            RuleBreakdownBucket[];
  by_location:            RuleBreakdownBucket[];
  hourly:                 { time: string; count: number }[];
  first_seen?:            string;
  last_seen?:             string;
  samples:                AlertSample[];
}

export interface RuleBreakdown {
  rule_id:              string;
  total:                number;
  top_agents:           RuleBreakdownBucket[];
  top_event_ids:        RuleBreakdownBucket[];
  top_users:            RuleBreakdownBucket[];
  top_src_ips:          RuleBreakdownBucket[];
  top_syscheck_paths:   RuleBreakdownBucket[];
  top_syscheck_events:  RuleBreakdownBucket[];
  top_srcusers:         RuleBreakdownBucket[];
  top_decoders:         RuleBreakdownBucket[];
  top_locations:        RuleBreakdownBucket[];
  hourly_pattern:       { time: string; count: number }[];
  sample_alerts:        AlertSample[];
}

export interface NoisyRule {
  rule_id: string;
  description: string;
  level: number;
  severity: string;
  alert_count: number;
  last_triggered: string;
}

export interface RuleTrend {
  daily: { date: string; count: number }[];
  total_7d: number;
  trend: "up" | "down" | "flat";
  trend_pct: number;
  top_processes: { value: string; count: number }[];
}

export interface WazuhRuleDetail {
  id: number | string;
  description: string;
  level: number;
  filename: string;
  if_sid: string;
  groups: string[];
  pci_dss: string[];
  nist_800_53: string[];
  gdpr: string[];
  hipaa: string[];
  tsc: string[];
  mitre: {
    id: string[];
    technique: string[];
    tactic: string[];
  };
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

export interface SuppressionLogEntry {
  id: number;
  created_at: string;
  rule_id: string;
  description: string;
  alert_count: number;
  reduction_pct: number | null;
  notes: string | null;
  total_alerts: number | null;
}

export interface NewSuppressionLog {
  rule_id: string;
  description: string;
  alert_count: number;
  reduction_pct?: number;
  notes?: string;
  total_alerts?: number;
}

export interface CveKeyword {
  keyword: string;
  enabled: boolean;
}

export interface AppSettings {
  notifications_enabled: boolean;
  notify_critical: boolean;
  notify_high: boolean;
  notify_medium: boolean;
  notify_low: boolean;
  notification_cooldown: number;
  agent_green_minutes: number;
  agent_yellow_minutes: number;
  offline_yellow_hours: number;
  offline_orange_hours: number;
  fleet_green_pct: number;
  fleet_amber_pct: number;
  patch_yellow_days: number;
  patch_orange_days: number;
  cve_keywords: CveKeyword[];
  default_theme: string;
  default_time_window: string;
  auto_refresh_interval: number;
  noisy_rules_page_size: number;
  alerts_page_size: number;
  // SMTP
  smtp_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  smtp_from_email: string;
  smtp_from_name: string;
  smtp_tls: boolean;
  // Informational — from environment, not persisted
  wazuh_url_display: string;
  wazuh_username_display: string;
  ninja_url_display: string;
  wazuh_configured: boolean;
  ninja_configured: boolean;
}

export interface CvssDetail {
  version: string;
  vector: string;
  attackVector: string;
  attackComplexity: string;
  privilegesRequired: string;
  userInteraction: string;
  scope: string;
  confidentiality: string;
  integrity: string;
  availability: string;
  exploitabilityScore?: number;
  impactScore?: number;
}

export interface AffectedDevice {
  id: number;
  systemName: string;
  offline: boolean;
  lastContact?: number;
  os: string;
}

export interface CveReference {
  url: string;
  source?: string;
  tags?: string[];
}

export interface CveItem {
  cve_id: string;
  published: string;
  last_modified: string;
  vuln_status: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "unknown";
  cvss_score: number;
  cvss_detail: CvssDetail | Record<string, never>;
  affected_products: string[];
  keyword: string;
  references: CveReference[];
  weaknesses: string[];
  affected_devices: AffectedDevice[];
  has_wazuh_coverage: boolean;
  remediation_effort: "Patch Available" | "Workaround Only" | "No Fix Available";
  has_known_exploit: boolean;
}

export interface DeviceExposure {
  device: AffectedDevice;
  critical: number;
  high: number;
  medium: number;
  low: number;
  cve_count: number;
}

export interface ThreatIntelResponse {
  cves: CveItem[];
  device_exposure: DeviceExposure[];
  last_updated: string;
  keyword_count: number;
  fetch_errors: string[];
  total_critical: number;
  total_high: number;
  total_medium: number;
  total_low: number;
  total_affecting_devices: number;
}

export interface ConnectionTestResult {
  status: "connected" | "failed";
  latency_ms?: number;
  timestamp?: string;
  error?: string;
}
