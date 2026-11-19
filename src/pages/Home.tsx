import { Link } from "react-router-dom";

export function Home() {
  return (
    <section>
      <h1>aember</h1>
      <p className="lead">
        A small, robust PID 1 for container appliances on embedded Linux. It boots
        the system, supervises your programs and LXC containers, and keeps the
        device alive, without systemd and without shell scripts in the boot path.
      </p>
      <div className="cta">
        <Link className="button primary" to="/demo">
          Watch it boot
        </Link>
        <Link className="button" to="/install">
          Install on a Pi or PC
        </Link>
        <Link className="button" to="/getting-started">
          Get started
        </Link>
      </div>

      <h2>Why</h2>
      <div className="grid">
        <div className="card">
          <h3>Small</h3>
          <p>
            PID 1 is one C++23 binary of about 1.2 MB, using about 5 MB of RAM. It
            does what an init must do; network and containers are separate services
            a device can leave out.
          </p>
        </div>
        <div className="card">
          <h3>Robust</h3>
          <p>
            PID 1 never dies: every phase is guarded, crashing services are
            restarted, and a hardware watchdog resets the board if PID 1 itself
            ever hangs.
          </p>
        </div>
        <div className="card">
          <h3>Made for appliances</h3>
          <p>
            Your application runs in LXC containers from read-only SquashFS images,
            with an overlay on top, graceful stops and restart policies, like a
            tiny, single-device container platform.
          </p>
        </div>
      </div>

      <h2>Compared with</h2>
      <p>
        aember is not a systemd replacement for desktops and servers. It aims at
        devices that run a few containers and a handful of services, where systemd +
        Docker is more than the job needs and BusyBox init is less: closer to
        Pantavisor, balenaOS or Torizon, but much smaller.
      </p>
    </section>
  );
}
