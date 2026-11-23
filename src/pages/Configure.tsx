import { useMemo, useState } from "react";
import { Command } from "../components/Command";
import {
  DEFAULT_WATCHDOG,
  defaultSelection,
  generate,
  SERVICES,
  type Selection,
  TARGETS,
  type TargetId,
  targetById,
} from "../configure/services";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function Configure() {
  const [sel, setSel] = useState<Selection>(defaultSelection());
  const out = useMemo(() => generate(sel), [sel]);
  const target = targetById(sel.target);

  const toggle = (list: "services" | "containers", id: string) =>
    setSel((s) => ({
      ...s,
      [list]: s[list].includes(id) ? s[list].filter((x) => x !== id) : [...s[list], id],
    }));

  return (
    <section>
      <h1>Configure</h1>
      <p className="notice" role="note">
        <strong>Preview.</strong> Pick what your aember image starts and see the
        configuration it gets. Nothing builds images from this page yet: put the files
        into <code>resources/{target.arch}/rootfs/etc/aember/</code> in the aember
        repository and pack the image yourself.
      </p>

      <div className="config-grid">
        <form className="card config-form" onSubmit={(e) => e.preventDefault()}>
          <label>
            Target{" "}
            <select
              aria-label="Target"
              value={sel.target}
              onChange={(e) => {
                const t = e.target.value as TargetId;
                setSel((s) => ({ ...s, target: t, containers: targetById(t).containers.map((c) => c.name) }));
              }}
            >
              {TARGETS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend>Services</legend>
            {SERVICES.map((s) => (
              <label key={s.id} className={s.status === "manual" ? "option manual" : "option"}>
                <input
                  type="checkbox"
                  checked={s.status === "available" && sel.services.includes(s.id)}
                  disabled={s.status === "manual"}
                  onChange={() => toggle("services", s.id)}
                />
                <span>
                  <strong>{s.label}</strong>
                  {s.status === "manual" && <span className="badge badge-idle">set up by hand</span>}
                  <br />
                  <span className="muted small">{s.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset disabled={!sel.services.includes("aember-containerd")}>
            <legend>Containers</legend>
            {target.containers.map((c) => (
              <label key={c.name} className="option">
                <input
                  type="checkbox"
                  checked={sel.containers.includes(c.name)}
                  onChange={() => toggle("containers", c.name)}
                />
                <span>
                  <strong>{c.name}</strong>
                  <br />
                  <span className="muted small">{c.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Boot</legend>
            <label className="option">
              <input
                type="checkbox"
                checked={sel.debugShell}
                onChange={() => setSel((s) => ({ ...s, debugShell: !s.debugShell }))}
              />
              <span>Debug shell at boot</span>
            </label>
            <label className="option">
              <span>Watchdog (s, 0 = off)</span>
              <input
                type="number"
                min={0}
                max={600}
                aria-label="Watchdog seconds"
                value={sel.watchdog}
                onChange={(e) => setSel((s) => ({ ...s, watchdog: Number(e.target.value) || 0 }))}
              />
            </label>
          </fieldset>
          <button type="button" onClick={() => setSel(defaultSelection(sel.target))}>
            Reset
          </button>
        </form>

        <div className="config-output">
          {out.notes.length > 0 && (
            <ul className="notes">
              {out.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <h2>services.json</h2>
          <pre data-testid="services-json">
            <code>{out.servicesJson}</code>
          </pre>
          <button type="button" onClick={() => download("services.json", out.servicesJson)}>
            Download services.json
          </button>

          <h2>containers.json</h2>
          {out.containersJson ? (
            <>
              <pre data-testid="containers-json">
                <code>{out.containersJson}</code>
              </pre>
              <button type="button" onClick={() => download("containers.json", out.containersJson!)}>
                Download containers.json
              </button>
            </>
          ) : (
            <p className="muted" data-testid="no-containers">
              Not needed: aember-containerd is not selected.
            </p>
          )}

          <h2>Kernel arguments</h2>
          {out.kernelArgs ? (
            <>
              <p className="small muted">Add to {target.argsWhere}:</p>
              <Command text={out.kernelArgs} label="kernel arguments" />
            </>
          ) : (
            <p className="muted" data-testid="no-args">
              None needed (watchdog {DEFAULT_WATCHDOG} s, no shell at boot).
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
