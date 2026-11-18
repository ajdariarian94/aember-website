import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dashboard } from "../../src/demo/Dashboard";
import type { Heartbeat } from "../../src/demo/types";

const HB: Heartbeat = {
  pid1: { pid: 1, rss_kb: 5120, threads: 6, children: 5, uptime_s: 125 },
  network: { online: true, iface: "eth0", rtt_ms: 16, ip: "10.0.2.15" },
  services: [
    { name: "aember-netd", state: "running", type: "process" },
    { name: "aember-child-demo", state: "restarting", type: "process" },
    { name: "aember-echo", state: "failed", type: "container" },
  ],
};

describe("Dashboard", () => {
  it("waits for the first heartbeat", () => {
    render(<Dashboard heartbeat={null} />);
    expect(screen.getByText(/first heartbeat/)).toBeInTheDocument();
  });

  it("shows PID 1, the network, services and containers", () => {
    render(<Dashboard heartbeat={HB} />);
    expect(screen.getByTestId("pid1-rss")).toHaveTextContent("5.0 MB");
    expect(screen.getByTestId("pid1-uptime")).toHaveTextContent("2 min 5 s");
    expect(screen.getByText("online")).toHaveClass("badge-ok");
    expect(screen.getByText("10.0.2.15")).toBeInTheDocument();
    const netd = screen.getByTestId("service-aember-netd");
    expect(within(netd).getByText("running")).toHaveClass("badge-ok");
    expect(within(screen.getByTestId("service-aember-child-demo")).getByText("restarting")).toHaveClass(
      "badge-warn",
    );
    const echo = screen.getByTestId("service-aember-echo");
    expect(within(echo).getByText("failed")).toHaveClass("badge-bad");
    // the container is listed under Containers, not Services
    const containers = screen.getByText("Containers").closest(".card")!;
    expect(within(containers as HTMLElement).getByText("aember-echo")).toBeInTheDocument();
  });

  it("says when no service reports the network", () => {
    render(<Dashboard heartbeat={{ ...HB, network: null }} />);
    expect(screen.getByTestId("network-none")).toHaveTextContent("not reported");
  });
});
