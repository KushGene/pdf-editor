import { useEffect } from "react";
import "./i18n";
import TopBar from "./components/TopBar";
import CanvasWorkspace from "./components/CanvasWorkspace";
import PropertyInspector from "./components/PropertyInspector";
import BottomBar from "./components/BottomBar";
import { useWorkspace } from "./context/WorkspaceContext";
import type { FormField } from "./types/FormField";
import "./App.css";

function KeyboardShortcuts() {
  const {
    selectedFieldId,
    formFields,
    clipboardField,
    setSelectedFieldId,
    setFormFields,
    setClipboardField,
    undo,
    redo,
    pushHistory,
  } = useWorkspace();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedFieldId) {
          e.preventDefault();
          pushHistory();
          setFormFields((prev) => prev.filter((f) => f.id !== selectedFieldId));
          setSelectedFieldId(null);
        }
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "c") {
          if (selectedFieldId) {
            e.preventDefault();
            const field = formFields.find((f) => f.id === selectedFieldId);
            if (field) setClipboardField(field);
          }
        }

        if (e.key.toLowerCase() === "v") {
          if (clipboardField) {
            e.preventDefault();
            pushHistory();
            const {
              origName: _on,
              origX: _ox,
              origY: _oy,
              origWidth: _ow,
              origHeight: _oh,
              origValue: _ov,
              widgetIndex: _wi,
              ...rest
            } = clipboardField;
            const newField: FormField = {
              ...rest,
              id: crypto.randomUUID(),
              x: clipboardField.x + 10,
              y: clipboardField.y + 10,
              widgetIndex: 0,
            };
            setFormFields((prev) => [...prev, newField]);
            setSelectedFieldId(newField.id);
          }
        }

        if (e.key.toLowerCase() === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
        }
        if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
          e.preventDefault();
          redo();
        }
      }

      // Arrow keys: move selected field 1px (Shift = 10px)
      if (
        (e.key === "ArrowLeft" ||
          e.key === "ArrowRight" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowDown") &&
        selectedFieldId
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx =
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy =
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        pushHistory();
        setFormFields((prev) =>
          prev.map((f) =>
            f.id === selectedFieldId
              ? { ...f, x: f.x + dx, y: f.y + dy }
              : f
          )
        );
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    selectedFieldId,
    formFields,
    clipboardField,
    setSelectedFieldId,
    setFormFields,
    setClipboardField,
    undo,
    redo,
    pushHistory,
  ]);

  return null;
}

function App() {
  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <CanvasWorkspace />
        <PropertyInspector />
      </div>
      <BottomBar />
      <KeyboardShortcuts />
    </div>
  );
}

export default App;
