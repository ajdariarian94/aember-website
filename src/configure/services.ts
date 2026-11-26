/**
 * The services configurator (a preview): which services and containers an
 * aember image starts. It writes the same files a board's rootfs overlay
 * has in aember (resources/<arch>/rootfs/etc/aember/services.json and
 * containers.json: which containers start; each one is a .aember package
 * with its own settings), and the kernel arguments for the boot options. Nothing
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

/** A container the target's image can start: its .aember package is in
 * aember's resources for that board (how it starts is in the package's
 * config.json, not in containers.json). */
export interface ContainerOption {
  name: string;
  description: string;
}

export interface ServiceOption {
  id: string;
  label: string;
  description: string;
  /** "manual": aember has it, but it needs more than this page writes. */
  status: "available" | "manual";
  /** Another service of this kind replaces it (radio-like). */
  group?: "network";
}

const ECHO_X64: ContainerOption = {
  name: "aember-echo",
  description: "A tiny shell container that prints a line every few seconds",
};
const ECHO_ARM: ContainerOption = {
  name: "alpine-echo",
  description: "A tiny shell container that prints a line every few seconds",
};
const STATS: ContainerOption = {
  name: "aember-stats",
  description: "Collects CPU, memory, network, disk, temperatures and PID 1's status",
};
const MONITOR: ContainerOption = {
  name: "aember-monitor",
  description: "Qt status display on the screen (framebuffer); needs aember-stats",
};

export const TARGETS: Target[] = [
  {
    id: "rpi4",
    label: "Raspberry Pi 4 (SD card)",
    arch: "aarch64-poky-linux",
    argsWhere: "cmdline.txt on the card's boot partition (one line)",
    containers: [ECHO_ARM, STATS, MONITOR],
  },
  {
    id: "x64-usb",
    label: "x86-64 PC (USB stick)",
    arch: "x64-poky-linux",
    argsWhere: "the options line of loader/entries/aember.conf on the stick",
    containers: [ECHO_X64, STATS, MONITOR],
  },
  {
    id: "qemu-x64",
    label: "QEMU (x86-64)",
    arch: "x64-poky-linux",
    argsWhere: 'aember app launch --append "…"',
    containers: [ECHO_X64, STATS, MONITOR],
  },
];

export const SERVICES: ServiceOption[] = [
  {
    id: "aember-netd",
    label: "aember-netd",
    description: "Network: interfaces, DHCP (with renewal), DNS, connectivity",
    status: "available",
    group: "network",
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
    services: ["aember-netd", "aember-containerd"],
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
    (s) => s.status === "available" && sel.services.includes(s.id),
  );
  const ids = new Set(chosen.map((s) => s.id));
  const notes: string[] = [];

  // Names (and what each needs first) only: each service's settings are its
  // own folder, /usr/lib/aember/services/<name>/config.json, which aember
  // installs with the service.
  // containerd starts next to aember-netd: a container that needs the
  // network says so itself ("services" in containers.json), none of these
  // do.
  const services = chosen.map((s) => ({ name: s.id }));
  if (!ids.has("aember-netd")) {
    notes.push("No network service: the device has no network unless the kernel's ip= sets it up.");
  }

  let containersJson: string | null = null;
  if (ids.has("aember-containerd")) {
    // Names (and what each needs first) only: everything else about a
    // container is in its .aember package. Containers without dependencies
    // start at the same time, next to the services (one that needs the
    // network lists "services": ["aember-netd"]).
    const containers = target.containers
      .filter((c) => sel.containers.includes(c.name))
      .map((c) => ({ name: c.name }));
    containersJson = pretty({
      allow_unsigned: true,
      bridges: [{ name: "lxcbr0", address: "10.0.3.1/24" }],
      containers,
    });
    if (containers.length === 0) notes.push("aember-containerd runs, but no container is selected.");
    if (sel.containers.includes("aember-monitor") && !sel.containers.includes("aember-stats")) {
      notes.push("aember-monitor shows what aember-stats collects: without it the screen stays empty.");
    }
  } else if (sel.containers.length > 0) {
    notes.push("Containers need aember-containerd: without it they are not started.");
  }

  const args: string[] = [];
  if (sel.debugShell) args.push("aember.shell=1");
  const wd = Math.max(0, Math.floor(sel.watchdog));
  if (wd !== DEFAULT_WATCHDOG) args.push(`aember.watchdog=${wd}`);
  if (wd === 0) notes.push("The hardware watchdog is off: a hung PID 1 is not reset.");

  return {
    servicesJson: pretty({ services }),
    containersJson,
    kernelArgs: args.join(" "),
    notes,
  };
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}
