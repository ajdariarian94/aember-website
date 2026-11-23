import type { Heartbeat, ServiceStatus } from "./types";

function formatUptime(s: number): string {
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

function StateBadge({ state }: { state: string }) {
  const kind =
    state === "running"
      ? "ok"
      : state === "failed"
        ? "bad"
        : state === "starting" || state === "restarting" || state === "stopping"
          ? "warn"
          : "idle";
  return <span className={`badge badge-${kind}`}>{state}</span>;
}

function ServiceList({ title, items }: { title: string; items: ServiceStatus[] }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted">none</p>
      ) : (
        <ul className="services">
          {items.map((s) => (
            <li key={s.name} data-testid={`service-${s.name}`}>
              <span className="mono">{s.name}</span>
              <StateBadge state={s.state} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** PID 1's heartbeat as a dashboard (what /var/log/aember-status.json holds). */
export function Dashboard({ heartbeat }: { heartbeat: Heartbeat | null }) {
  if (!heartbeat) {
    return (
      <div className="dashboard" data-testid="dashboard">
        <p className="muted">Waiting for PID 1's first heartbeat…</p>
      </div>
    );
  }
  const { pid1, network, services } = heartbeat;
  const processes = services.filter((s) => s.type !== "container");
  const containers = services.filter((s) => s.type === "container");
  return (
    <div className="dashboard" data-testid="dashboard">
      <div className="card">
        <h3>PID 1</h3>
        {pid1 ? (
          <dl className="stats">
            <dt>memory</dt>
            <dd data-testid="pid1-rss">{(pid1.rss_kb / 1024).toFixed(1)} MB</dd>
            <dt>threads</dt>
            <dd>{pid1.threads}</dd>
            <dt>children</dt>
            <dd>{pid1.children}</dd>
            <dt>uptime</dt>
            <dd data-testid="pid1-uptime">{formatUptime(pid1.uptime_s)}</dd>
          </dl>
        ) : (
          <p className="muted">no data</p>
        )}
      </div>
      <div className="card">
        <h3>Network</h3>
        {network ? (
          <dl className="stats">
            <dt>status</dt>
            <dd>
              <span className={`badge ${network.online ? "badge-ok" : "badge-bad"}`}>
                {network.online ? "online" : "offline"}
              </span>
            </dd>
            <dt>interface</dt>
            <dd className="mono">{network.iface || "—"}</dd>
            <dt>address</dt>
            <dd className="mono">{network.ip || "—"}</dd>
            <dt>round trip</dt>
            <dd>{network.rtt_ms >= 0 ? `${network.rtt_ms} ms` : "—"}</dd>
          </dl>
        ) : (
          <p className="muted" data-testid="network-none">
            not reported (no aember network service)
          </p>
        )}
      </div>
      <ServiceList title="Services" items={processes} />
      <ServiceList title="Containers" items={containers} />
    </div>
  );
}
