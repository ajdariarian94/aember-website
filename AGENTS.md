# AGENTS.md

Guidance for AI coding agents (Claude Code, Copilot, Codex, …) working in
**aember-website**.

## What this repo is

The website of **aember** (`../aember`, a C++23 PID 1 for container
appliances): what it is and why, architecture, features, hardware, getting
started, **install** (Pi 4 SD card and x86-64 USB stick images through
Raspberry Pi Imager / balenaEtcher), a services **configurator** (preview)
and a **demo** that replays real recorded aember sessions: the serial
console in xterm.js next to the device's screen (the aember-monitor
container, from a video recorded in the same run).

A **static** React site: Vite + TypeScript, hash routing, no backend. The
build (`dist/`) must run from any static host or sub-folder, so keep
`base: "./"` (`vite.config.ts`) and the `HashRouter`. Never add a server
side: no flasher, no image builder, no API of our own.

Repository: <https://github.com/ajdariarian94/aember-website> (public).
Like the sibling repos: branch off `main` (`fix/<x>`, `enhancement/<x>`,
`docs/<x>`) and merge through a PR.

Live at <https://ajdariarian94.github.io/aember-website/>: merging to `main`
deploys it (`.github/workflows/pages.yml`: job `build` = `npm ci`, type
check, Vitest, the recorder tests, `npm run build`; job `e2e` = Playwright
against the production build in `mcr.microsoft.com/playwright:v1.49.1-noble`
(keep its tag equal to `@playwright/test` in package.json); job `deploy`
uploads `dist/` to GitHub Pages only when both pass; Pages source =
"GitHub Actions"). The workflow's Node version, image and action versions
are pinned; bump them on purpose. Pull requests run the tests and the build
without deploying. In CI Playwright has no retries (a flaky test fails the
run instead of hiding) and a failing run uploads `playwright-report/` and
`test-results/` (traces) as the `playwright-report` artifact: open it with
`npx playwright show-report` / `npx playwright show-trace`.

## Layout

```
.github/workflows/      pages.yml: tests + build + e2e, deploy to GitHub Pages on push to main
.devcontainer/          Dockerfile (Playwright image: Node 22 + Chromium, + Python,
                        Docker CLI, /venv with the aember CLI), devcontainer.json
aember-cli/             the `aember` CLI (Python, Typer): cli/, core/, steps/, config/,
                        utils/, tests/; installed editable in /venv
tools/scripts/          init.sh (postStart: Docker group, completion, prompt, npm ci),
                        prerequisites.sh (host), bashrc.d/
requirements.txt        Python tooling for the venv (typer, rich, black, ruff)
index.html              Vite entry
src/main.tsx            mounts <App/>
src/App.tsx             HashRouter, PAGES (nav + routes), ROUTER_FUTURE flags;
                        the Demo page is lazy-loaded (it brings xterm.js)
src/pages/*.tsx         Home, Architecture, Features, Hardware, GettingStarted,
                        Install, Configure, Demo
src/install/releases.ts aember's latest GitHub release: image assets, Imager repo URL
src/configure/services.ts  configurator data + generate() (services.json,
                        containers.json, kernel args)
src/components/Command.tsx  a shell command with a copy button
src/demo/types.ts       Recording format (format 2): console + screen events, frameTime()
src/demo/recording.ts   validateRecording, loadRecording, loadSceneIndex
src/demo/player.ts      ReplayPlayer, timeline(), MAX_GAP_MS (gap compression)
src/demo/Terminal.tsx   xterm.js view (@xterm/addon-fit)
src/demo/Screen.tsx     the screen: a <video> (WebM + MP4 sources) the player seeks
src/styles.css          the only stylesheet; colors as tokens on :root, dark mode
                        via prefers-color-scheme
public/recordings/      <scene>.json + .webm + .mp4 (boot, kill-service, debug-shell),
                        index.json
scripts/record.py       records scenes from a real aember run (stdlib Python)
scripts/test_record.py  its unittest suite
scripts/test_properties.py  property tests (Hypothesis, from
                        scripts/requirements-dev.txt; skipped without it):
                        any chunking of the console, merge order, frames
tests/unit/             Vitest (jsdom): player, recordings, pages (demo with screen), Screen,
                        install (release lookup), configure (generator + page)
tests/e2e/              Playwright against the production build
```

## The dev container and the CLI

Same model as aember and aember-resources: work inside the dev container
(`/aember_ws/aember-website`, user `dev`, `/venv` on PATH), with the
`aember` CLI (Typer commands in `aember-cli/aember/cli/`, `Step`s in
`aember/steps/`, `Pipeline([...]).run(Context())`, logging through
`logging.getLogger("aember.<area>")` with rich). The CLI finds the repo by
`package.json` with `"name": "aember-website"` (`utils/root.py`).

```sh
aember install | dev | build | preview | test [--e2e] [--cli|--no-cli]
aember record --source "aember <V>, x64 QEMU" [--scene ...] [--command ...]
aember lint [--fix] | clean [--all]
```

- Steps that need Node run `NpmInstall` first (`npm ci` when
  `node_modules/.package-lock.json` is missing or older than the lock file).
- The Playwright browsers come from the base image
  (`PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`); `@playwright/test` in
  package.json must stay at the image's version (1.49.1), or the browsers
  won't match. Bump both together (and the image digest).
- `--ipc=host` in devcontainer.json: Chromium needs more shared memory than
  Docker's default.
- `aember record` needs the Docker socket: it finds the running container
  that mounts `/aember_ws/aember` (`steps/recording/record.py`) and runs
  `aember app launch --headless` there through `docker exec -i`.
- Without the dev container: the npm scripts, and the images
  `node:22.12.0-bookworm-slim` / `mcr.microsoft.com/playwright:v1.49.1-noble`
  with the repo mounted (`-u $(id -u):$(id -g) -e HOME=/tmp`).
- The Playwright image is ~3.5 GB: remove images you built only to test
  when done (the WSL disk has run full before).

## Install page and aember's releases

- `src/install/releases.ts` reads
  `https://api.github.com/repos/ajdariarian94/aember/releases/latest`
  (CORS allowed, 60 requests/h per IP unauthenticated) and picks
  `aember-rpi4-v<V>.img.xz`, `aember-x64-usb-v<V>.img.xz` and
  `aember-rpi-imager.json`. These names are written by aember's
  `steps/releasing/images.py` (`aember release`) and uploaded by
  `aember publish`: change both repos together.
- Raspberry Pi Imager: `rpi-imager --repo
  https://github.com/ajdariarian94/aember/releases/latest/download/aember-rpi-imager.json`
  (`IMAGER_COMMAND`), or Imager's App Options → Content Repository → Use
  custom URL. balenaEtcher: "Flash from URL" with the image link.
- No release, no images, rate limit or offline → the page shows how to build
  the image (`aember rpi image`, `aember usb image`); it must never break.
- Developer commands shown there (`aember rpi image|flash|launch`,
  `aember usb image|flash|launch`) must exist in `../aember`; the USB stick
  needs UEFI with Secure Boot off.
- Tests never touch the network: unit tests stub `fetch`, Playwright
  routes `https://api.github.com/**` to a fake release.

## Configurator (preview)

- `src/configure/services.ts` mirrors aember's overlay files
  (`resources/<arch>/rootfs/etc/aember/services.json` and
  `containers.json`): the service entries, bridge and container entries
  must match aember's real ones (key names, timeouts, paths under
  `/var/lib/aember`). When aember changes them, update the catalogue and the
  tests.
- `generate()` rules: containerd depends on aember-netd only when netd is
  selected; no containerd → no containers.json; `status: "manual"`
  services (ConnMan: an aember package that needs D-Bus, wpa_supplicant and
  its own config files) are shown disabled ("set up by hand") and never
  written; kernel args:
  `aember.shell=1`, `aember.watchdog=<s>` when not the default 15.
- aember-monitor without aember-stats gets a note (the screen stays
  empty). The Pi target's echo container is `alpine-echo` (aember's
  aarch64 overlay), x64's `aember-echo`.
- It is a **preview**: the page says so, and nothing builds images.

## Recordings

- Format (`src/demo/types.ts`, `FORMAT = 2` in `record.py`): `scene`,
  `title`, `description`, `recorded`, `source`, `duration_ms`, optional
  `screen` = `{sources: ["<scene>.webm", "<scene>.mp4"], fps, frames}`,
  `events` sorted by `t` (ms). Event `console` = raw console text (ANSI
  kept); event `screen` = the index of the screen video's frame shown
  from then on.
- The format is shared by `record.py`, `types.ts` and
  `validateRecording`: change all three together (and bump the format if
  old files would no longer load).
- The screen: `aember app launch --headless --qmp <socket>` (aember
  0.14+) gives QEMU a QMP socket; the recorder runs `GRABBER` (a stdlib
  Python QMP client, fed on stdin) next to it, which prints a base64 PNG
  of `screendump` once a second. Leading frames in another size than the
  last one (QEMU's 640x480 "Display output is not active" before the
  kernel sets the mode) are dropped. ffmpeg encodes the frames at 1
  frame/s into VP9 WebM (Chrome, Firefox, Edge; Playwright's Chromium has
  no H.264) and H.264 MP4 (Safari), a keyframe every 5 frames. Both
  sources, in that order.
- aember no longer prints a heartbeat on the console (since the
  aember-stats/monitor split): the screen is what shows the services'
  states. Don't bring back a console parser for it.
- Recordings are real runs; never hand-edit or fabricate them. Redo them
  after an aember release with `aember record` (the aember dev container
  running, x64 built and packed there, with aember-stats and
  aember-monitor in its overlay).
- The recorder lets each run end by its own `--timeout`; killing the
  client (`docker exec`) leaves QEMU running and holding the disk image,
  and the next scene fails. The grabber ends when QEMU closes the socket.
  `open_shell` presses `d` up to 3 times.
- After recording, the tests check the files (valid, a real boot, both
  videos there, one screen event per frame in order, netd killed and
  running again, the shell opened). The recorder merges console bursts
  (< 20 ms) into one event to keep them small.

## Player

- `ReplayPlayer` plays events against a `Clock` (tests inject a fake
  one; never use real timers in unit tests). `timeline()` compresses
  pauses longer than `MAX_GAP_MS` (1.5 s) so the demo doesn't sit idle;
  seeking re-renders the console from the start up to the position.
- The screen shows the last frame at or before the position: `Screen`
  sets the paused video's `currentTime` to the middle of that frame
  (`frameTime`), after `loadedmetadata` if the video isn't ready yet.

## Conventions

- TypeScript strict, function components, named exports. No CSS framework
  and no UI library: plain CSS in `styles.css` with the color tokens
  (light and dark). Layout must work at phone width without horizontal
  scrolling (the e2e test checks every page at 375 px).
- Dependencies are pinned to exact versions in `package.json` (and the
  lockfile). Don't add one without a reason; nothing that needs a server
  at runtime.
- React Router stays on v6 with the v7 future flags (`ROUTER_FUTURE`), so
  tests run without warnings.
- Every change gets tests: Vitest for logic and components, the
  Playwright spec when a page's behaviour changes, `test_record.py` (and
  a property in `test_properties.py` for anything that parses or orders)
  for the recorder, `aember-cli/tests` for the CLI. Before calling something
  done: `aember lint` and `aember test --e2e` pass, and the demo plays in
  the built site.
- Regression tests: a test that pins down a fixed bug starts with a
  comment `Regression: <the bug>` (`grep -rn "Regression:"` lists them).
  Every bug fix gets one.
- Page content describes aember as it is: check claims (commands,
  targets, features) against `../aember` (its README.md, AGENTS.md,
  TODO.md). Don't advertise what TODO.md lists as open (the real Pi 4 and
  real PCs are not verified yet; the pages say so).
- Python (`scripts/`, `aember-cli/`): standard library in `scripts/`,
  Typer/rich only in the CLI; black + ruff, 88 columns.

## Working agreements for agents

- Commit, push and merge only when asked.
- Don't commit `dist/`, `node_modules/`, `test-results/`, caches or
  `tools/scripts/.env` (`.gitignore`).
- Don't edit `../aember` from here; if the site needs a change there
  (e.g. the `--qmp` option, release asset names), say so.
- Keep this file and README.md current: update them in the same change
  when something here goes stale.
