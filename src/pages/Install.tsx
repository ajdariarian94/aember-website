import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Command } from "../components/Command";
import {
  type Asset,
  fetchLatestRelease,
  formatSize,
  IMAGER_COMMAND,
  IMAGER_REPO_URL,
  type LatestRelease,
  RELEASES_URL,
} from "../install/releases";

type State = { status: "loading" } | { status: "done"; release: LatestRelease | null };

function Download({ asset, what, build }: { asset: Asset | null; what: string; build: string }) {
  if (!asset) {
    return (
      <p className="notice" data-testid={`missing-${what}`}>
        No published release has this image yet. Build it yourself with{" "}
        <code>{build}</code> (see “For developers” below).
      </p>
    );
  }
  return (
    <p>
      <a className="button primary" href={asset.url} data-testid={`download-${what}`}>
        Download {asset.name}
      </a>{" "}
      <span className="muted small">{formatSize(asset.size)}, xz-compressed</span>
    </p>
  );
}

export function Install() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchLatestRelease().then((release) => !cancelled && setState({ status: "done", release }));
    return () => {
      cancelled = true;
    };
  }, []);

  const release = state.status === "done" ? state.release : null;
  const rpi = release?.rpi ?? null;
  const usb = release?.usb ?? null;

  return (
    <section>
      <h1>Install</h1>
      <p className="lead">
        Put aember on a Raspberry Pi 4 SD card or on a USB stick for an x86-64 PC.
        Browsers can't write to cards or sticks, so the image goes on with a
        flashing tool you may already have: Raspberry Pi Imager or balenaEtcher.
      </p>
      <p className="muted" data-testid="release-status">
        {state.status === "loading"
          ? "Looking up the latest release…"
          : release
            ? <>Latest release: <a href={release.url}>{release.tag}</a></>
            : <>Could not read the latest release. All releases: <a href={RELEASES_URL}>GitHub</a>.</>}
      </p>

      <h2>Raspberry Pi 4: SD card</h2>
      <div className="grid">
        <div className="card">
          <h3>Raspberry Pi Imager (recommended)</h3>
          <ol>
            <li>
              Install <a href="https://www.raspberrypi.com/software/">Raspberry Pi Imager</a>.
            </li>
            <li>
              Start it with aember's image list:
              <Command text={IMAGER_COMMAND} label="Imager command" />
              or in Imager: <em>App Options → Content Repository → Use custom URL</em>,
              then <code className="wrap">{IMAGER_REPO_URL}</code>.
            </li>
            <li>Insert the SD card. Choose <em>Raspberry Pi 4</em>, then <em>aember</em>, then your card.</li>
            <li>
              Write. Imager downloads the image, writes it and verifies it. Skip its
              “OS customisation”: aember doesn't use it.
            </li>
          </ol>
        </div>
        <div className="card">
          <h3>balenaEtcher</h3>
          <ol>
            <li>
              Install <a href="https://etcher.balena.io/">balenaEtcher</a>.
            </li>
            <li>
              <em>Flash from URL</em> with the image link below (or download it and use{" "}
              <em>Flash from file</em>).
            </li>
            <li>Select the SD card, then <em>Flash!</em></li>
          </ol>
          <Download asset={rpi} what="rpi" build="aember rpi image" />
        </div>
      </div>
      <p className="small muted">
        Then put the card into the Pi and power it on. The console is the serial port
        on GPIO 14/15 (115200 8N1): press <kbd>d</kbd> there for a shell. To boot
        without the hardware watchdog, add <code>aember.watchdog=0</code> to{" "}
        <code>cmdline.txt</code> on the card.
      </p>

      <h2>x86-64 PC: USB stick</h2>
      <div className="grid">
        <div className="card">
          <h3>Write the stick</h3>
          <ol>
            <li>
              In <a href="https://etcher.balena.io/">balenaEtcher</a>: <em>Flash from URL</em>{" "}
              with the image link, select the USB stick, <em>Flash!</em> Raspberry Pi
              Imager works too: <em>Use custom</em> with the downloaded file.
            </li>
          </ol>
          <Download asset={usb} what="usb" build="aember usb image" />
        </div>
        <div className="card">
          <h3>Boot the PC from it</h3>
          <ol>
            <li>
              Boot in <strong>UEFI mode with Secure Boot off</strong>. The aember
              kernel is not signed, and the stick has no legacy BIOS boot.
            </li>
            <li>Choose the stick in the firmware's boot menu (often F12, F11, F10 or Esc).</li>
            <li>
              A short menu offers aember, aember with the console on the serial port,
              and aember with a shell at boot.
            </li>
          </ol>
          <p className="small muted">
            The console is the screen; press <kbd>d</kbd> on the keyboard for a shell.
            Nothing on the PC's own disks is touched.
          </p>
        </div>
      </div>

      <h2>For developers</h2>
      <p>
        In the aember dev container, build the image and write it to a card or stick in
        a reader attached to the machine (on WSL first <code>usbipd attach --wsl</code>).
        The flash commands refuse disks that don't look like a card or stick and ask
        before writing.
      </p>
      <Command
        label="Raspberry Pi commands"
        text={`aember app build --architecture aarch64-poky-linux
aember app pack --architecture aarch64-poky-linux
aember rpi image                       # build/rpi/aember-rpi4-v<V>.img
aember rpi flash --device /dev/sdX     # write it to the SD card
aember rpi launch --timeout 60         # or try it in QEMU first`}
      />
      <Command
        label="USB stick commands"
        text={`aember app build && aember app pack
aember usb image                       # build/usb/aember-x64-usb-v<V>.img
aember usb flash --device /dev/sdX     # write it to the USB stick
aember usb launch --headless --timeout 90   # boot it in QEMU (UEFI, USB)`}
      />
      <p>
        Want other services on the image? Try the <Link to="/configure">configurator</Link>.
      </p>
    </section>
  );
}
