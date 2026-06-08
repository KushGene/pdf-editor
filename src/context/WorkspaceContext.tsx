import { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction, useCallback, useRef } from "react";
import type { FormField } from "../types/FormField";

export const RENDER_SCALE = 3.0;

export type ToolType = "pan" | "select" | "add_text" | "add_checkbox" | "add_dropdown" | "add_signature" | "add_image";

interface HistoryEntry {
  formFields: FormField[];
}

/** Deep-clone a FormField so nested arrays (options) are not shared by reference. */
function cloneField(f: FormField): FormField {
  return {
    ...f,
    options: f.options ? [...f.options] : undefined,
  };
}

interface WorkspaceState {
  pdfBuffer: ArrayBuffer | null;
  filePath: string | null;
  loadedFieldNames: Set<string>;
  formFields: FormField[];
  selectedFieldId: string | null;
  activeTool: ToolType;
  scale: number;
  panOffset: { x: number; y: number };
  previewMode: boolean;
  clipboardField: FormField | null;
  canUndo: boolean;
  canRedo: boolean;
  setPdfBuffer: (buffer: ArrayBuffer | null) => void;
  setFilePath: (path: string | null) => void;
  setLoadedFieldNames: (names: Set<string>) => void;
  setFormFields: Dispatch<SetStateAction<FormField[]>>;
  setSelectedFieldId: (id: string | null) => void;
  setActiveTool: (tool: ToolType) => void;
  setScale: Dispatch<SetStateAction<number>>;
  setPanOffset: Dispatch<SetStateAction<{ x: number; y: number }>>;
  setPreviewMode: (mode: boolean) => void;
  setClipboardField: (field: FormField | null) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
}

const WorkspaceContext = createContext<WorkspaceState | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [loadedFieldNames, setLoadedFieldNames] = useState<Set<string>>(new Set());
  const [formFields, _setFormFields] = useState<FormField[]>([]);
  const [selectedFieldId, _setSelectedFieldId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>("pan");
  const [scale, setScale] = useState(1.5);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [previewMode, setPreviewMode] = useState(false);
  const [clipboardField, setClipboardField] = useState<FormField | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Internal refs for undo/redo
  const formFieldsRef = useRef(formFields);
  formFieldsRef.current = formFields;

  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);
  const isUndoingRef = useRef(false);
  const isInitialLoadRef = useRef(true);

  const updateHistoryButtons = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  const pushHistory = useCallback(() => {
    if (isUndoingRef.current) return;
    if (isInitialLoadRef.current) return;

    const entry: HistoryEntry = {
      formFields: formFieldsRef.current.map(cloneField),
    };

    const next = historyRef.current.slice(0, historyIndexRef.current + 1);
    next.push(entry);
    if (next.length > 50) next.shift();

    historyRef.current = next;
    historyIndexRef.current = next.length - 1;
    updateHistoryButtons();
  }, [updateHistoryButtons]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;

    isUndoingRef.current = true;
    try {
      historyIndexRef.current -= 1;
      const entry = historyRef.current[historyIndexRef.current];
      _setFormFields(entry.formFields.map(cloneField));
      updateHistoryButtons();
    } finally {
      isUndoingRef.current = false;
    }
  }, [updateHistoryButtons]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;

    isUndoingRef.current = true;
    try {
      historyIndexRef.current += 1;
      const entry = historyRef.current[historyIndexRef.current];
      _setFormFields(entry.formFields.map(cloneField));
      updateHistoryButtons();
    } finally {
      isUndoingRef.current = false;
    }
  }, [updateHistoryButtons]);

  // Reset history when a new PDF is loaded
  const wrappedSetPdfBuffer = useCallback((buffer: ArrayBuffer | null) => {
    setPdfBuffer(buffer);
    if (buffer) {
      isInitialLoadRef.current = true;
      historyRef.current = [];
      historyIndexRef.current = -1;
      setCanUndo(false);
      setCanRedo(false);
    }
  }, []);

  // After initial formFields load, push that state as the first history entry
  const wrappedSetFormFields = useCallback((value: SetStateAction<FormField[]>) => {
    _setFormFields((prev) => {
      const next =
        typeof value === "function"
          ? (value as (prev: FormField[]) => FormField[])(prev)
          : value;

      // If this is the initial load of form fields, record it as history entry 0
      if (isInitialLoadRef.current && next.length > 0) {
        isInitialLoadRef.current = false;
        historyRef.current = [{
          formFields: next.map(cloneField),
        }];
        historyIndexRef.current = 0;
        setCanUndo(false);
        setCanRedo(false);
      }

      return next;
    });
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        pdfBuffer,
        filePath,
        loadedFieldNames,
        formFields,
        selectedFieldId,
        activeTool,
        scale,
        panOffset,
        previewMode,
        clipboardField,
        canUndo,
        canRedo,
        setPdfBuffer: wrappedSetPdfBuffer,
        setFilePath,
        setLoadedFieldNames,
        setFormFields: wrappedSetFormFields,
        setSelectedFieldId: _setSelectedFieldId,
        setActiveTool,
        setScale,
        setPanOffset,
        setPreviewMode,
        setClipboardField,
        pushHistory,
        undo,
        redo,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (ctx === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return ctx;
}
