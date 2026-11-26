import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { defaultSelection, generate, SERVICES } from "../../src/configure/services";
import { Configure } from "../../src/pages/Configure";

const names = (json: string) => JSON.parse(json).services.map((p: { name: string }) => p.name);

describe("configurator", () => {
  it("the default matches the boards' services.json", () => {
    const out = generate(defaultSelection("rpi4"));
    expect(names(out.servicesJson)).toEqual(["aember-netd", "aember-containerd"]);
    const ctrd = JSON.parse(out.servicesJson).services[1];
    expect(ctrd.dependencies).toEqual(["aember-netd"]);
    // Names and dependencies only: the settings are each service's folder.
    expect(Object.keys(ctrd).sort()).toEqual(["dependencies", "name"]);
    const containers = JSON.parse(out.containersJson!);
    expect(containers.bridges[0].name).toBe("lxcbr0");
    expect(containers.containers.map((c: { name: string }) => c.name)).toEqual([
      "alpine-echo",
      "aember-stats",
      "aember-monitor",
    ]);
    expect(out.kernelArgs).toBe("");
    expect(out.notes).toEqual([]);
  });

  it("without aember-netd, containerd no longer depends on it", () => {
    const sel = { ...defaultSelection("x64-usb"), services: ["aember-containerd"] };
    const out = generate(sel);
    const [ctrd] = JSON.parse(out.servicesJson).services;
    expect(ctrd.name).toBe("aember-containerd");
    expect(ctrd.dependencies).toBeUndefined();
    expect(out.notes.join(" ")).toMatch(/No network service/);
  });

  it("without containerd there is no containers.json", () => {
    const sel = { ...defaultSelection("qemu-x64"), services: ["aember-netd"] };
    const out = generate(sel);
    expect(out.containersJson).toBeNull();
    expect(out.notes.join(" ")).toMatch(/need aember-containerd/);
  });

  it("manual services are never written", () => {
    expect(SERVICES.find((s) => s.id === "connman")?.status).toBe("manual");
    const out = generate({ ...defaultSelection(), services: ["connman", "aember-netd"] });
    expect(names(out.servicesJson)).toEqual(["aember-netd"]);
  });

  it("aember-monitor without aember-stats gets a note", () => {
    const sel = { ...defaultSelection("x64-usb"), containers: ["aember-monitor"] };
    expect(generate(sel).notes.join(" ")).toMatch(/without it the screen stays empty/);
  });

  it("boot options become kernel arguments", () => {
    expect(generate({ ...defaultSelection(), debugShell: true, watchdog: 30 }).kernelArgs).toBe(
      "aember.shell=1 aember.watchdog=30",
    );
    const off = generate({ ...defaultSelection(), watchdog: 0 });
    expect(off.kernelArgs).toBe("aember.watchdog=0");
    expect(off.notes.join(" ")).toMatch(/watchdog is off/);
  });

  it("containers.json lists only names: the rest is in each package", () => {
    const containers = JSON.parse(generate(defaultSelection("qemu-x64")).containersJson!);
    expect(containers.allow_unsigned).toBe(true);
    for (const c of containers.containers) expect(Object.keys(c)).toEqual(["name"]);
  });
});

describe("configure page", () => {
  it("is marked as a preview and updates the files as you choose", () => {
    render(<Configure />);
    expect(screen.getByRole("note")).toHaveTextContent("Preview");
    expect(screen.getByTestId("services-json")).toHaveTextContent("aember-netd");

    fireEvent.click(screen.getByRole("checkbox", { name: /^aember-netd/ }));
    expect(screen.getByTestId("services-json")).not.toHaveTextContent('"aember-netd"');

    fireEvent.click(screen.getByRole("checkbox", { name: /^aember-containerd/ }));
    expect(screen.getByTestId("no-containers")).toBeInTheDocument();

    expect(screen.getByRole("checkbox", { name: /ConnMan/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Target"), { target: { value: "x64-usb" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Debug shell at boot/ }));
    expect(screen.getByText("aember.shell=1")).toBeInTheDocument();
    expect(screen.getByText(/loader\/entries\/aember\.conf/)).toBeInTheDocument();
  });
});
