# aember website

The website of [aember](https://github.com/ajdariarian94/aember), a small,
robust PID 1 for container appliances: what it is, why, how it is built,
its features, supported hardware, getting started, and a **demo** that
replays recorded aember sessions: the serial console in xterm.js and
PID 1's heartbeat as a dashboard.

A static React site (Vite + TypeScript, hash routing): no backend, it runs
from any static host or sub-folder.

## Develop

```sh
npm install
npm run dev            # http://localhost:5173
npm test               # Vitest: player, recordings, components, pages
npm run test:record    # the recorder's own tests (Python)
npm run build          # type check + production build into dist/
npm run test:e2e       # Playwright against the build (npm run build first)
```

No Node on the machine? Everything works in the official image, e.g.
`docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp -v $PWD:/w -w /w
node:22.12.0-bookworm-slim npm test`; the end-to-end tests run in
`mcr.microsoft.com/playwright:v1.49.1-noble` (`npx playwright test`).

## Deploy

`dist/` is the whole site. Copy it to any static host (GitHub Pages,
Netlify, an S3 bucket, `python3 -m http.server`).

## Recordings

`public/recordings/<scene>.json` are real sessions, recorded by
`scripts/record.py` from `aember app launch --headless` (QEMU, x64). Each
holds the console output with timestamps and the heartbeats PID 1 printed,
turned into dashboard data. Scenes: `boot`, `kill-service` (a service and a
container's app get killed and come back), `debug-shell`.

Redo them after each aember release, where the `aember` command works
(after `aember app build` and `aember app pack` for x64):

```sh
python3 scripts/record.py --scene all --source "aember <version>, x64 QEMU"
```

or from the host, through the aember dev container:

```sh
python3 scripts/record.py --scene all --source "aember <version>, x64 QEMU" \
  --command 'docker exec -i -w /aember_ws/aember <container> aember app launch --headless --timeout {timeout}'
```

The script waits for each run to end by itself (its `--timeout`), so no
QEMU is left running between scenes. Then `npm test` checks the new
recordings (valid, real boot, restarts visible, shell opened).
