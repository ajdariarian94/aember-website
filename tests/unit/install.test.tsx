import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROUTER_FUTURE } from "../../src/App";
import {
  fetchLatestRelease,
  formatSize,
  IMAGER_COMMAND,
  IMAGER_REPO_URL,
  LATEST_API,
  pickAssets,
} from "../../src/install/releases";
import { Install } from "../../src/pages/Install";

const ASSETS = [
  { name: "aember-app-x64-poky-linux-Release-v0.13.0.tar.gz", browser_download_url: "u0", size: 1 },
  { name: "aember-rpi4-v0.13.0.img.xz", browser_download_url: "https://x/rpi.img.xz", size: 120 * 1024 ** 2 },
  { name: "aember-rpi4-v0.13.0.img.xz.sha256", browser_download_url: "u2", size: 90 },
  { name: "aember-x64-usb-v0.13.0.img.xz", browser_download_url: "https://x/usb.img.xz", size: 2 * 1024 ** 3 },
  { name: "aember-rpi-imager.json", browser_download_url: "https://x/imager.json", size: 900 },
];

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => ({ ok: status === 200, status, json: async () => body })) as unknown as typeof fetch;
}

describe("latest release", () => {
  it("picks the images and the Imager list, not their checksums", () => {
    const r = pickAssets("v0.13.0", "https://rel", ASSETS);
    expect(r.rpi?.url).toBe("https://x/rpi.img.xz");
    expect(r.usb?.name).toBe("aember-x64-usb-v0.13.0.img.xz");
    expect(r.imager?.url).toBe("https://x/imager.json");
  });

  it("asks GitHub's API and handles no release and no network", async () => {
    const ok = fakeFetch(200, { tag_name: "v0.13.0", html_url: "https://rel", assets: ASSETS });
    expect((await fetchLatestRelease(ok))?.tag).toBe("v0.13.0");
    expect((ok as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(LATEST_API);
    expect(await fetchLatestRelease(fakeFetch(404, {}))).toBeNull();
    expect(await fetchLatestRelease(fakeFetch(200, { message: "rate limited" }))).toBeNull();
    const offline = vi.fn(async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch;
    expect(await fetchLatestRelease(offline)).toBeNull();
  });

  it("Imager always reads the newest release's list", () => {
    expect(IMAGER_REPO_URL).toMatch(/\/releases\/latest\/download\/aember-rpi-imager\.json$/);
    expect(IMAGER_COMMAND).toBe(`rpi-imager --repo ${IMAGER_REPO_URL}`);
  });

  it("formats sizes", () => {
    expect(formatSize(120 * 1024 ** 2)).toBe("120 MB");
    expect(formatSize(2 * 1024 ** 3)).toBe("2.0 GB");
  });
});

describe("install page", () => {
  afterEach(() => vi.unstubAllGlobals());

  function renderPage() {
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <Install />
      </MemoryRouter>,
    );
  }

  it("offers Imager, Etcher downloads and the developer commands", async () => {
    vi.stubGlobal("fetch", fakeFetch(200, { tag_name: "v0.13.0", html_url: "https://rel", assets: ASSETS }));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("release-status")).toHaveTextContent("v0.13.0"));
    expect(screen.getByTestId("download-rpi")).toHaveAttribute("href", "https://x/rpi.img.xz");
    expect(screen.getByTestId("download-usb")).toHaveAttribute("href", "https://x/usb.img.xz");
    expect(screen.getByText(IMAGER_COMMAND)).toBeInTheDocument();
    expect(screen.getAllByText(/balenaEtcher/).length).toBeGreaterThan(0);
    expect(screen.getByText(/UEFI mode with Secure Boot off/)).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).toContain("aember rpi flash --device /dev/sdX");
    expect(text).toContain("aember usb flash --device /dev/sdX");
  });

  it("without published images it says how to build them", async () => {
    vi.stubGlobal("fetch", fakeFetch(404, {}));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("missing-rpi")).toBeInTheDocument());
    expect(screen.getByTestId("missing-usb")).toHaveTextContent("aember usb image");
    expect(screen.getByTestId("release-status")).toHaveTextContent("Could not read");
  });
});
