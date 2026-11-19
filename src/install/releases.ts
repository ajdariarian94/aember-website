/**
 * The flashable images of aember's latest GitHub release. `aember release`
 * builds them and `aember publish` uploads them (aember repo,
 * steps/releasing/images.py): the Raspberry Pi 4 SD card image, the
 * x86-64 USB stick image and the Raspberry Pi Imager repository list.
 */

export const REPO = "ajdariarian94/aember";
export const RELEASES_URL = `https://github.com/${REPO}/releases`;
export const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

export const IMAGER_JSON = "aember-rpi-imager.json";
/** Always the newest release's list (GitHub redirects /latest/download/). */
export const IMAGER_REPO_URL = `${RELEASES_URL}/latest/download/${IMAGER_JSON}`;
export const IMAGER_COMMAND = `rpi-imager --repo ${IMAGER_REPO_URL}`;

const RPI_IMAGE = /^aember-rpi4-v[\w.-]+\.img\.xz$/;
const USB_IMAGE = /^aember-x64-usb-v[\w.-]+\.img\.xz$/;

export interface Asset {
  name: string;
  url: string;
  size: number;
}

export interface LatestRelease {
  tag: string;
  url: string;
  rpi: Asset | null;
  usb: Asset | null;
  imager: Asset | null;
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export function pickAssets(tag: string, url: string, assets: GitHubAsset[]): LatestRelease {
  const find = (test: (name: string) => boolean): Asset | null => {
    const a = assets.find((x) => test(x.name));
    return a ? { name: a.name, url: a.browser_download_url, size: a.size } : null;
  };
  return {
    tag,
    url,
    rpi: find((n) => RPI_IMAGE.test(n)),
    usb: find((n) => USB_IMAGE.test(n)),
    imager: find((n) => n === IMAGER_JSON),
  };
}

/** The latest release, or null when there is none or GitHub can't be reached. */
export async function fetchLatestRelease(
  fetchFn: typeof fetch = fetch,
): Promise<LatestRelease | null> {
  try {
    const res = await fetchFn(LATEST_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const body = await res.json();
    if (typeof body?.tag_name !== "string" || !Array.isArray(body?.assets)) return null;
    return pickAssets(body.tag_name, body.html_url ?? RELEASES_URL, body.assets);
  } catch {
    return null;
  }
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}
