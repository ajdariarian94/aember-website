# aember-website CLI

The `aember` command of the website repository (Python, Typer, rich
logging), installed editable in the dev container's `/venv`. Same
structure as the aember and aember-resources CLIs: thin Typer commands in
`aember/cli/`, `Step`s in `aember/steps/`, `Pipeline([...]).run(ctx)`.

```bash
aember --help
aember install            # npm ci (also run by the other commands when needed)
aember dev                # dev server, http://localhost:5173
aember build              # type check + production build into dist/
aember preview            # build, then serve dist/ on http://localhost:4173
aember test               # CLI + recorder (Python) + Vitest
aember test --e2e         # ... + production build + Playwright
aember record --source "aember 0.13.0, x64 QEMU"   # new demo recordings
aember lint [--fix]       # tsc + ruff + black
aember clean [--all]      # dist/, test output (--all: node_modules too)
```
