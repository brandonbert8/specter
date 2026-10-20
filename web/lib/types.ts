export type ProcessInfo = {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_percent: number;
};

export type TelemetrySnapshot = {
  collected_at: string;
  os: string;
  cpu_percent: number;
  ram_total_gb: number;
  ram_used_percent: number;
  disk_total_gb: number;
  disk_used_percent: number;
  cpu_temp_celsius: number | null;
  top_cpu_processes: ProcessInfo[];
  top_ram_processes: ProcessInfo[];
};

export type AlertLevel = "HEALTHY" | "WARNING" | "CRITICAL";

export type DiagnosticReport = {
  summary: string;
  alert_level: AlertLevel;
  probable_causes: string[];
  recommendations: string[];
  evidence: string[];
  limitations: string[];
};

export type DiagnosticSession = DiagnosticReport & {
  diagnostic_id: string;
  generated_at: string;
  snapshot: TelemetrySnapshot;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  diagnostic_id: string;
  message: string;
};
