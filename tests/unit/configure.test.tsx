import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { defaultSelection, generate, SERVICES, TARGETS } from "../../src/configure/services";
import { Configure } from "../../src/pages/Configure";

const names = (json: string) => JSON.parse(json).processes.map((p: { name: string }) => p.name);

describe("configurator", () => {
  it("the default matches the boards' services.json", () => {
    const out = generate(defaultSelection("rpi4"));
    expect(names(out.servicesJson)).toEqual(["aember-netd", "aember-containerd", "aember-child-demo"]);
    const ctrd = JSON.parse(out.servicesJson).processes[1];
    expect(ctrd.dependencies).toEqual(["aember-netd"]);
    expect(ctrd.stop_timeout_ms).toBe(60000);
    const containers = JSON.parse(out.containersJson!);
    expect(containers.bridges[0].name).toBe("lxcbr0");
    expect(containers.containers.map((c: { name: string }) => c.name)).toEqual(["alpine-echo"]);
    expect(out.kernelArgs).toBe("");
    expect(out.notes).toEqual([]);
  });

  it("without aember-netd, containerd no longer depends on it", () => {
    const sel = { ...defaultSelection("x64-usb"), services: ["aember-containerd"] };
    const out = generate(sel);
    const [ctrd] = JSON.parse(out.servicesJson).processes;
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

  it("planned services are never written", () => {
    expect(SERVICES.find((s) => s.id === "connman")?.status).toBe("planned");
    const out = generate({ ...defaultSelection(), services: ["connman", "aember-netd"] });
    expect(names(out.servicesJson)).toEqual(["aember-netd"]);
  });

  it("boot options become kernel arguments", () => {
    expect(generate({ ...defaultSelection(), debugShell: true, watchdog: 30 }).kernelArgs).toBe(
      "aember.shell=1 aember.watchdog=30",
    );
    const off = generate({ ...defaultSelection(), watchdog: 0 });
    expect(off.kernelArgs).toBe("aember.watchdog=0");
    expect(off.notes.join(" ")).toMatch(/watchdog is off/);
  });

  it("every target's containers point into /var/lib/aember", () => {
    for (const t of TARGETS) {
      for (const c of t.containers) {
        const ctr = (c.entry as { container: Record<string, string> }).container;
        expect(ctr.squashfs).toMatch(/^\/var\/lib\/aember\/.+\.squashfs$/);
        expect(ctr.config_path).toMatch(/lxc\.container\.conf$/);
      }
    }
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
