/** What PID 1's heartbeat says, as scripts/record.py extracts it. */
export interface Pid1Stats {
  pid: number;
  rss_kb: number;
  threads: number;
  children: number;
  uptime_s: number;
}

export interface NetworkStatus {
  online: boolean;
  iface: string;
  rtt_ms: number;
  ip: string;
}

export interface ServiceStatus {
  name: string;
  state: string;
  type: "process" | "container" | string;
}

export interface Heartbeat {
  pid1: Pid1Stats | null;
  /** null: no service reports the network. */
  network: NetworkStatus | null;
  services: ServiceStatus[];
}

export type RecordingEvent =
  | { t: number; type: "console"; data: string }
  | { t: number; type: "heartbeat"; data: Heartbeat };

/** One recorded scene (public/recordings/<scene>.json, format 1). */
export interface Recording {
  format: 1;
  scene: string;
  title: string;
  description: string;
  recorded: string;
  source: string;
  duration_ms: number;
  events: RecordingEvent[];
}
