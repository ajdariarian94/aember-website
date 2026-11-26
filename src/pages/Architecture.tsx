export function Architecture() {
  return (
    <section>
      <h1>Architecture</h1>
      <p className="lead">
        One binary is PID 1; everything else is a service PID 1 starts, watches and
        restarts.
      </p>
      <div className="arch" aria-label="aember boot and process tree">
        <div className="arch-row">
          <div className="box">
            <strong>kernel</strong>
            <span>Linux from aember-resources, trimmed for appliances</span>
          </div>
          <div className="arrow">→</div>
          <div className="box">
            <strong>initramfs /init = aember</strong>
            <span>mounts, kernel modules, finds the root by LABEL/UUID, switch_root</span>
          </div>
          <div className="arrow">→</div>
          <div className="box accent">
            <strong>aember --root (PID 1)</strong>
            <span>mounts, modules, reaping, signals, watchdog, heartbeat</span>
          </div>
        </div>
        <div className="arch-children">
          <p className="arch-label">services PID 1 starts (services.json)</p>
          <div className="box">
            <strong>aember-netd</strong>
            <span>interfaces, DHCP with lease renewal, DNS, connectivity</span>
          </div>
          <div className="box">
            <strong>aember-containerd</strong>
            <span>LXC containers, their bridge, restart policies</span>
          </div>
          <div className="box">
            <strong>your services</strong>
            <span>anything in services.json, with dependencies and restarts</span>
          </div>
        </div>
        <div className="arch-children">
          <p className="arch-label">containers aember-containerd runs (containers.json)</p>
          <div className="box">
            <strong>aember-stats</strong>
            <span>CPU, memory, network, disk, temperatures and PID 1's status, once a second</span>
          </div>
          <div className="box">
            <strong>aember-monitor</strong>
            <span>a Qt status display on the screen, fed by aember-stats</span>
          </div>
          <div className="box">
            <strong>your application</strong>
            <span>a read-only SquashFS image with an overlay, restarted by its policy</span>
          </div>
        </div>
      </div>

      <h2>PID 1</h2>
      <p>
        PID 1 only does what an init must: early mounts, kernel modules (read from
        modules.dep, loaded with finit_module), reaping orphans, signals, the
        service supervisor, a hardware watchdog and a heartbeat. It calls no
        external programs on the way: loop devices, mount(2), rtnetlink and a
        built-in DHCP client replace BusyBox's mount, modprobe, ip and udhcpc.
      </p>

      <h2>Services</h2>
      <p>
        A service is any program in <code>/etc/aember/services.json</code>, started
        in dependency order and restarted when it fails. With <code>"ipc": true</code>{" "}
        it gets a channel to PID 1 on file descriptor 3: it reports when it is
        ready, sends status events for the heartbeat, and hears when a debug shell
        takes the console. aember's own network and container handling are such
        services, so a device that uses ConnMan, or runs no containers, simply
        leaves them out, and their code is not even in the image.
      </p>

      <h2>Containers</h2>
      <p>
        Each container is one <code>.aember</code> package: its read-only SquashFS
        image, how to start it (<code>config.json</code>) and its LXC configuration,
        compressed and signed. aember-containerd installs a package once onto the
        device's disk (the version before kept for a rollback) and starts the
        container from there with an OverlayFS on top. <code>containers.json</code>{" "}
        lists only which containers start and what each needs first: containers
        that don't depend on each other start at the same time. A small init
        inside each container passes SIGTERM on, so containers stop gracefully;{" "}
        <code>restart_policy</code> (no, on-failure, always) decides what happens
        when one exits. If containerd itself crashes, the containers keep running
        and are adopted when it comes back.
      </p>
    </section>
  );
}
