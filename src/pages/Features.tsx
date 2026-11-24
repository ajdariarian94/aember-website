const FEATURES: { title: string; body: string }[] = [
  {
    title: "Hardware watchdog",
    body:
      "PID 1 feeds /dev/watchdog only while its main loop and its reaper are alive, so a hung init resets the board. aember.watchdog=<seconds> on the kernel command line sets the timeout, aember.watchdog=0 turns it off. For a requested reboot or power-off the watchdog is disarmed first.",
  },
  {
    title: "Debug shell",
    body:
      "Press d on the console at any time for a root shell; aember.shell=1 opens one at boot. While it is open, PID 1 and its services keep quiet on the console, and the log files keep everything.",
  },
  {
    title: "Restart policies",
    body:
      "Services restart after a configurable delay, with an optional limit. Containers follow restart_policy (no, on-failure, always), max_restart_attempts and restart_delay; a container that ran for a minute counts as healthy again.",
  },
  {
    title: "Services you can add",
    body:
      "Drop a folder into services/ with a CMakeLists.txt and one aember_service() call: it is built with aember, packed when a board lists it, and can talk to PID 1 over the same channel netd and containerd use.",
  },
  {
    title: "DHCP that lasts",
    body:
      "The built-in DHCP client renews its lease on time, rebinds when the server is gone, starts over when the lease is refused, and keeps an address it finds already configured.",
  },
  {
    title: "Graceful shutdown",
    body:
      "reboot, poweroff and halt work like with BusyBox init: services stop in reverse dependency order, containers get SIGTERM and their stop timeout, file systems are unmounted.",
  },
  {
    title: "Root by label",
    body:
      "root=LABEL=… or root=UUID=… works without udev: aember reads the ext4 superblocks itself and waits for slow devices such as SD cards.",
  },
  {
    title: "Observable",
    body:
      "Every second PID 1 writes its status (its memory and threads, the network, every service and container) to /var/log/aember-status.json, which containers can read: aember-stats adds CPU, memory, disk and temperatures, and aember-monitor draws it all on the device's screen (see the demo).",
  },
  {
    title: "Only what you list",
    body:
      "An image holds the services in services.json, the containers in containers.json and the opt-in packages in packages.json, nothing more. Prebuilt packages: Dropbear SSH, ext4 tools, a Wi-Fi client (WPA3) and access point, and ConnMan.",
  },
  {
    title: "Fleet updates",
    body:
      "aember-auth gives each device an Ed25519 identity that never leaves it; aember-fleet's agent installs the signed container releases a self-hosted fleet server assigns, checks they stay up, and rolls back the ones that don't.",
  },
];

export function Features() {
  return (
    <section>
      <h1>Features</h1>
      <div className="grid">
        {FEATURES.map((f) => (
          <div className="card" key={f.title}>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
