/**
 * The services configurator (a preview): which services and containers an
 * aember image starts. It writes the same files a board's rootfs overlay
 * has in aember (resources/<arch>/rootfs/etc/aember/services.json and
 * containers.json), and the kernel arguments for the boot options. Nothing
 * builds an image from it yet: copy the files into the overlay and run
 * `aember app pack` + `aember rpi image` / `aember usb image`.
 */

export type TargetId = "rpi4" | "x64-usb" | "qemu-x64";

export interface Target {
  id: TargetId;
  label: string;
  arch: string;
  /** Where the kernel arguments go on this target. */
  argsWhere: string;
  containers: ContainerOption[];
}

export interface ContainerOption {
  name: string;
  description: string;
  entry: Record<string, unknown>;
}

export interface ServiceOption {
  id: string;
  label: string;
  description: string;
  /** "manual": aember has it, but it needs more than this page writes. */
  status: "available" | "manual";
  /** Another service of this kind replaces it (radio-like). */
  group?: "network";
  entry?: Record<string, unknown>;
}

const container = (
  name: string,
  dir: string,
  image: string,
  args: string[],
): Record<string, unknown> => ({
  name,
  type: "container",
  container: {
    squashfs: `/var/lib/aember/${dir}/${image}.squashfs`,
    rootfs: `/var/lib/aember/containers/${dir}`,
    config_path: `/var/lib/aember/${dir}/lxc.container.conf`,
    args,
  },
  restart_policy: "always",
  dependencies: [],
  max_restart_attempts: 5,
  restart_delay: 5,
});

const ECHO_X64: ContainerOption = {
  name: "aember-echo",
  description: "A tiny shell container that prints a line every few seconds",
  entry: container("aember-echo", "aember-echo", "aember-echo", ["/bin/sh", "/echo-alpine.sh"]),
};
const MONITOR: ContainerOption = {
  name: "aember-monitor",
  description: "Qt dashboard on the screen (framebuffer)",
  entry: container("aember-monitor", "aember-monitor", "aember-monitor", ["/usr/bin/aember-monitor"]),
};
const ECHO_ARM: ContainerOption = {
  name: "alpine-echo",
  description: "A tiny shell container that prints a line every few seconds",
  entry: container("alpine-echo", "alpine", "alpine", ["/bin/sh", "/echo-alpine.sh"]),
};

export const TARGETS: Target[] = [
  {
    id: "rpi4",
    label: "Raspberry Pi 4 (SD card)",
    arch: "aarch64-poky-linux",
    argsWhere: "cmdline.txt on the card's boot partition (one line)",
    containers: [ECHO_ARM],
  },
  {
    id: "x64-usb",
    label: "x86-64 PC (USB stick)",
    arch: "x64-poky-linux",
    argsWhere: "the options line of loader/entries/aember.conf on the stick",
    containers: [ECHO_X64, MONITOR],
  },
  {
    id: "qemu-x64",
    label: "QEMU (x86-64)",
    arch: "x64-poky-linux",
    argsWhere: 'aember app launch --append "…"',
    containers: [ECHO_X64, MONITOR],
  },
];

export const SERVICES: ServiceOption[] = [
  {
    id: "aember-netd",
    label: "aember-netd",
    description: "Network: interfaces, DHCP (with renewal), DNS, connectivity",
    status: "available",
    group: "network",
    entry: {
      name: "aember-netd",
      description: "Network: interfaces, DHCP, DNS, connectivity (services/netd)",
      executable: "/usr/bin/aember-netd",
      ipc: true,
      ready_timeout_ms: 120000,
      restart_on_failure: true,
      max_restarts: 0,
      restart_delay_ms: 2000,
      stop_timeout_ms: 10000,
    },
  },
  {
    id: "connman",
    label: "ConnMan",
    description:
      "Network with Wi-Fi (ConnMan + wpa_supplicant + D-Bus) instead of aember-netd: the connman and wifi packages, set up as in aember's doc/packages.md",
    status: "manual",
    group: "network",
  },
  {
    id: "aember-containerd",
    label: "aember-containerd",
    description: "LXC containers from containers.json, their bridges, restarts",
    status: "available",
    entry: {
      name: "aember-containerd",
      description: "LXC containers and their bridges (services/containerd)",
      executable: "/usr/bin/aember-containerd",
      ipc: true,
      ready_timeout_ms: 120000,
      restart_on_failure: true,
      max_restarts: 0,
      restart_delay_ms: 2000,
      stop_timeout_ms: 60000,
    },
  },
  {
    id: "aember-child-demo",
    label: "aember-child-demo",
    description: "Example service: a program PID 1 supervises and restarts",
    status: "available",
    entry: {
      name: "aember-child-demo",
      executable: "/usr/bin/aember-child-demo",
      args: [],
      working_directory: "",
      environment: {},
      restart_on_failure: true,
      max_restarts: 3,
      restart_delay_ms: 6000,
    },
  },
];

export interface Selection {
  target: TargetId;
  services: string[];
  containers: string[];
  debugShell: boolean;
  /** Seconds; 0 turns PID 1's hardware watchdog off. */
  watchdog: number;
}

export const DEFAULT_WATCHDOG = 15;

export function defaultSelection(target: TargetId = "rpi4"): Selection {
  return {
    target,
    services: ["aember-netd", "aember-containerd", "aember-child-demo"],
    containers: targetById(target).containers.map((c) => c.name),
    debugShell: false,
    watchdog: DEFAULT_WATCHDOG,
  };
}

export function targetById(id: TargetId): Target {
  const t = TARGETS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown target ${id}`);
  return t;
}

export interface Generated {
  servicesJson: string;
  /** null: no aember-containerd, so no containers.json is needed. */
  containersJson: string | null;
  kernelArgs: string;
  notes: string[];
}

export function generate(sel: Selection): Generated {
  const target = targetById(sel.target);
  const chosen = SERVICES.filter(
    (s) => s.status === "available" && sel.services.includes(s.id) && s.entry,
  );
  const ids = new Set(chosen.map((s) => s.id));
  const notes: string[] = [];

  const processes = chosen.map((s) => {
    const entry: Record<string, unknown> = { ...s.entry };
    // containerd waits for the network only when aember-netd is there.
    if (s.id === "aember-containerd" && ids.has("aember-netd")) {
      entry.dependencies = ["aember-netd"];
    }
    return entry;
  });
  if (!ids.has("aember-netd")) {
    notes.push("No network service: the device has no network unless the kernel's ip= sets it up.");
  }

  let containersJson: string | null = null;
  if (ids.has("aember-containerd")) {
    const containers = target.containers
      .filter((c) => sel.containers.includes(c.name))
      .map((c) => c.entry);
    containersJson = pretty({
      bridges: [{ name: "lxcbr0", address: "10.0.3.1/24" }],
      containers,
    });
    if (containers.length === 0) notes.push("aember-containerd runs, but no container is selected.");
  } else if (sel.containers.length > 0) {
    notes.push("Containers need aember-containerd: without it they are not started.");
  }

  const args: string[] = [];
  if (sel.debugShell) args.push("aember.shell=1");
  const wd = Math.max(0, Math.floor(sel.watchdog));
  if (wd !== DEFAULT_WATCHDOG) args.push(`aember.watchdog=${wd}`);
  if (wd === 0) notes.push("The hardware watchdog is off: a hung PID 1 is not reset.");

  return {
    servicesJson: pretty({ processes }),
    containersJson,
    kernelArgs: args.join(" "),
    notes,
  };
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}
