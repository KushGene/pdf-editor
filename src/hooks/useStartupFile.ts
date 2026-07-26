import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspace } from "../context/WorkspaceContext";

/**
 * Opens the PDF that was handed over on the command line, e.g. when the file
 * manager launches the app for a `application/pdf` file. Does nothing when the
 * app is started without arguments.
 */
export function useStartupFile() {
  const { setPdfBuffer, setFilePath } = useWorkspace();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const path = await invoke<string | null>("startup_file");
        if (cancelled || !path) return;
        const buffer = await invoke<ArrayBuffer>("read_pdf_bytes", { path });
        if (cancelled) return;
        setPdfBuffer(buffer);
        setFilePath(path);
      } catch (err) {
        console.error("[startup] could not open the file from the command line:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setPdfBuffer, setFilePath]);
}
