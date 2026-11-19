# aember website

The website of [aember](https://github.com/ajdariarian94/aember), a small,
robust PID 1 for container appliances: what it is, why, how it is built,
its features, supported hardware, getting started, **install** (Raspberry
Pi 4 SD card and x86-64 USB stick, with Raspberry Pi Imager or
balenaEtcher), a services **configurator** (preview) and a **demo** that
replays recorded aember sessions: the serial console in xterm.js and
PID 1's heartbeat as a dashboard.

A static React site (Vite + TypeScript, hash routing): no backend, it runs
from any static host or sub-folder.

## Develop

Like aember and aember-resources, the repository brings its dev container
and an `aember` CLI:

1. `git clone https://github.com/ajdariarian94/aember-website.git` next to
   `aember`, then on the host (Linux or WSL2 with Docker, VS Code with Dev
   Containers): `./tools/scripts/prerequisites.sh`
2. Open the folder in VS Code → "Reopen in Container". The container is
   the official Playwright image (Node 22, Chromium) plus Python and the
   Docker CLI; `npm ci` runs on the first start.

```sh
aember dev               # http://localhost:5173, hot reload
aember test              # CLI + recorder (Python) + Vitest
aember test --e2e        # ... + production build + Playwright
aember build             # type check + production build into dist/
aember preview           # serve dist/ on http://localhost:4173
aember lint [--fix]      # tsc, ruff, black
aember clean [--all]     # build and test output (--all: node_modules)
aember --help
```

The npm scripts (`npm run dev|build|test|test:e2e|typecheck`) work the same
without the CLI.

## Deploy

The site is live at **<https://ajdariarian94.github.io/aember-website/>**.
`.github/workflows/pages.yml` publishes it on GitHub Pages on every push to
`main`: unit tests, recorder tests, `npm run build`, then `dist/` goes up.

`dist/` is the whole site, so any other static host works too (Netlify, an
S3 bucket, `python3 -m http.server` in `dist/`).

## Install page

The Install page asks GitHub's API for aember's latest release and links its
flashable images (`aember-rpi4-v<V>.img.xz`, `aember-x64-usb-v<V>.img.xz`),
which aember's `aember release` builds and `aember publish` uploads. Raspberry
Pi Imager gets aember's image list from the same release:

```sh
rpi-imager --repo https://github.com/ajdariarian94/aember/releases/latest/download/aember-rpi-imager.json
```

Without a published image the page says how to build one (`aember rpi image`,
`aember usb image`). Browsers can't write SD cards, so the page doesn't try.

## Configurator (preview)

`/configure` picks the target (Raspberry Pi 4, x86-64 USB stick, QEMU), the
services (aember-netd, aember-containerd, the demo service; ConnMan is listed
as planned), the containers and the boot options (debug shell, watchdog), and
shows the resulting `services.json`, `containers.json` and kernel arguments,
in aember's own formats. Nothing builds images from it yet.

## Recordings

`public/recordings/<scene>.json` are real sessions, recorded by
`scripts/record.py` from `aember app launch --headless` (QEMU, x64). Each
holds the console output with timestamps and the heartbeats PID 1 printed,
turned into dashboard data. Scenes: `boot`, `kill-service` (a service and a
container's app get killed and come back), `debug-shell`.

Redo them after each aember release, with the aember dev container running
(after `aember app build` and `aember app pack` for x64 there):

```sh
aember record --source "aember <version>, x64 QEMU"
```

It finds the running aember dev container and starts each scene there with
`docker exec`; `--scene boot` records one, `--command` runs aember some other
way. Each run ends by itself (its `--timeout`), so no QEMU is left running
between scenes. Then the tests check the new recordings (valid, real boot,
restarts visible, shell opened).
