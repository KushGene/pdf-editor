import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

const RELEASES_API =
  "https://api.github.com/repos/KushGene/pdf-editor/releases/latest";
export const RELEASES_PAGE =
  "https://github.com/KushGene/pdf-editor/releases/latest";

/** True if `latest` is a higher semver than `current` (e.g. "0.2.0" > "0.1.9"). */
function isNewer(latest: string, current: string): boolean {
  const a = latest.split(".").map(Number);
  const b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Reads the app version from Tauri and checks GitHub once on startup
 * for a newer published release. Fails silently when offline or rate-limited.
 */
export function useUpdateCheck() {
  const [version, setVersion] = useState("");
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await getVersion();
        if (cancelled) return;
        setVersion(current);

        const res = await fetch(RELEASES_API, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!res.ok) return;
        const data = await res.json();
        const tag =
          typeof data.tag_name === "string"
            ? data.tag_name.replace(/^v/, "")
            : null;
        if (!cancelled && tag && isNewer(tag, current)) {
          setLatestVersion(tag);
        }
      } catch {
        /* offline or rate-limited – no update hint */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { version, latestVersion, updateAvailable: latestVersion !== null };
}
