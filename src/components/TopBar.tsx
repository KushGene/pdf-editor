import {
  FolderOpen,
  Save,
  SaveAll,
  MousePointer2,
  Hand,
  Type,
  CheckSquare,
  List,
  Pencil,
  Image,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Eye,
  Loader2,
  Undo2,
  Redo2,
} from "lucide-react";
import { useState } from "react";
import { open, save, message } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../context/WorkspaceContext";
import { buildPdfBytes } from "../utils/buildPdfBytes";
import type { ToolType } from "../context/WorkspaceContext";

const TOOLS: { key: ToolType; icon: React.ReactNode; labelKey: string }[] = [
  { key: "pan", icon: <Hand size={16} />, labelKey: "pan" },
  { key: "select", icon: <MousePointer2 size={16} />, labelKey: "select" },
  { key: "add_text", icon: <Type size={16} />, labelKey: "text" },
  { key: "add_checkbox", icon: <CheckSquare size={16} />, labelKey: "checkbox" },
  { key: "add_dropdown", icon: <List size={16} />, labelKey: "dropdown" },
  { key: "add_signature", icon: <Pencil size={16} />, labelKey: "signature" },
  { key: "add_image", icon: <Image size={16} />, labelKey: "image" },
];

export default function TopBar() {
  const { t, i18n } = useTranslation();
  const {
    pdfBuffer,
    filePath,
    loadedFieldNames,
    formFields,
    selectedFieldId,
    activeTool,
    scale,
    previewMode,
    canUndo,
    canRedo,
    setPdfBuffer,
    setFilePath,
    setActiveTool,
    setSelectedFieldId,
    setFormFields,
    setScale,
    setPreviewMode,
    pushHistory,
    undo,
    redo,
  } = useWorkspace();
  const [isSaving, setIsSaving] = useState(false);

  async function handleOpenPdf() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (selected === null) return;
    const path = typeof selected === "string" ? selected : selected[0];
    const bytes = await readFile(path);
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    );
    setPdfBuffer(buffer);
    setFilePath(path);
  }

  /** Overwrite the currently open file (no dialog). */
  async function handleSave() {
    if (!pdfBuffer || isSaving) return;
    setIsSaving(true);
    try {
      const bytes = await buildPdfBytes(pdfBuffer, formFields, loadedFieldNames);
      if (filePath) {
        // Backup before overwriting
        try {
          const original = await readFile(filePath);
          await writeFile(filePath + ".backup", new Uint8Array(original));
        } catch {
          /* ignore backup failures */
        }
        await writeFile(filePath, bytes);
      } else {
        // No path yet – fall back to Save As
        await handleSaveAsCore(bytes);
      }
    } catch (err) {
      await message(
        `${t("saveError")}:\n${err instanceof Error ? err.message : String(err)}`,
        { title: t("error"), kind: "error" }
      );
    } finally {
      setIsSaving(false);
    }
  }

  /** Show file dialog and save to chosen path. */
  async function handleSaveAs() {
    if (!pdfBuffer || isSaving) return;
    setIsSaving(true);
    try {
      const bytes = await buildPdfBytes(pdfBuffer, formFields, loadedFieldNames);
      await handleSaveAsCore(bytes);
    } catch (err) {
      await message(
        `${t("saveError")}:\n${err instanceof Error ? err.message : String(err)}`,
        { title: t("error"), kind: "error" }
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveAsCore(bytes: Uint8Array) {
    const chosen = await save({ filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (chosen) {
      await writeFile(chosen, bytes);
      setFilePath(chosen);
    }
  }

  function handleDeleteField() {
    if (!selectedFieldId) return;
    pushHistory();
    setFormFields((prev) => prev.filter((f) => f.id !== selectedFieldId));
    setSelectedFieldId(null);
  }

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0 1rem",
        height: "40px",
        borderBottom: "1px solid #3e3e42",
        backgroundColor: "#252526",
        flexShrink: 0,
      }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
      <button
        onClick={handleOpenPdf}
        title={t("open")}
        style={{ height: "28px", padding: "0 0.6rem" }}
      >
        <FolderOpen size={14} />
        <span style={{ fontSize: "0.8rem" }}>{t("open")}</span>
      </button>

      <div style={{ width: "1px", height: "20px", backgroundColor: "#3e3e42" }} />

      {TOOLS.map((tool) => {
        const isActive = activeTool === tool.key;
        return (
          <button
            key={tool.key}
            onClick={() => {
              setActiveTool(tool.key);
              setSelectedFieldId(null);
            }}
            title={t(tool.labelKey)}
            style={{
              height: "28px",
              width: "28px",
              padding: 0,
              backgroundColor: isActive ? "#3b82f6" : "#252526",
              color: isActive ? "#ffffff" : "#cccccc",
              borderColor: isActive ? "#3b82f6" : "#3e3e42",
            }}
          >
            {tool.icon}
          </button>
        );
      })}

      <div style={{ width: "1px", height: "20px", backgroundColor: "#3e3e42" }} />

      <button
        onClick={undo}
        disabled={!canUndo}
        title={t("undo")}
        style={{
          height: "28px",
          width: "28px",
          padding: 0,
          opacity: canUndo ? 1 : 0.4,
        }}
      >
        <Undo2 size={14} />
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        title={t("redo")}
        style={{
          height: "28px",
          width: "28px",
          padding: 0,
          opacity: canRedo ? 1 : 0.4,
        }}
      >
        <Redo2 size={14} />
      </button>

      <div style={{ width: "1px", height: "20px", backgroundColor: "#3e3e42" }} />

      <button
        onClick={handleDeleteField}
        disabled={!selectedFieldId}
        title={t("delete")}
        style={{ height: "28px", width: "28px", padding: 0 }}
      >
        <Trash2 size={14} />
      </button>

      <div style={{ width: "1px", height: "20px", backgroundColor: "#3e3e42" }} />

      <button
        onClick={() => setPreviewMode(!previewMode)}
        title={t("preview")}
        style={{
          height: "28px",
          width: "28px",
          padding: 0,
          backgroundColor: previewMode ? "#3b82f6" : "#252526",
          color: previewMode ? "#ffffff" : "#cccccc",
          borderColor: previewMode ? "#3b82f6" : "#3e3e42",
        }}
      >
        <Eye size={16} />
      </button>

      <div style={{ width: "1px", height: "20px", backgroundColor: "#3e3e42" }} />

      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
        <button
          onClick={() => setScale(Math.max(0.25, scale - 0.25))}
          title={t("zoomOut")}
          style={{ height: "28px", width: "28px", padding: 0 }}
        >
          <ZoomOut size={14} />
        </button>
        <span
          style={{
            fontSize: "0.75rem",
            color: "#cccccc",
            minWidth: "48px",
            textAlign: "center",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale(Math.min(4, scale + 0.25))}
          title={t("zoomIn")}
          style={{ height: "28px", width: "28px", padding: 0 }}
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={() => setScale(1.5)}
          title={t("zoomFit")}
          style={{ height: "28px", width: "28px", padding: 0 }}
        >
          <Maximize size={14} />
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <select
        value={i18n.language}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        title={t("language")}
        style={{
          height: "28px",
          padding: "0 0.4rem",
          fontSize: "0.75rem",
          backgroundColor: "#252526",
          color: "#cccccc",
          border: "1px solid #3e3e42",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        <option value="de">DE</option>
        <option value="en">EN</option>
        <option value="fr">FR</option>
      </select>

      <button
        onClick={handleSave}
        disabled={!pdfBuffer || isSaving}
        title={filePath ? `Speichern (${filePath.split("/").pop()})` : t("save")}
        style={{ height: "28px", padding: "0 0.6rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
      >
        {isSaving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
        <span style={{ fontSize: "0.8rem" }}>{t("save")}</span>
      </button>

      <button
        onClick={handleSaveAs}
        disabled={!pdfBuffer || isSaving}
        title="Speichern unter…"
        style={{ height: "28px", padding: "0 0.6rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
      >
        {isSaving ? <Loader2 size={14} className="spin" /> : <SaveAll size={14} />}
        <span style={{ fontSize: "0.8rem" }}>Unter…</span>
      </button>
    </header>
  );
}
