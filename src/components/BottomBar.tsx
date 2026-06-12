import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../context/WorkspaceContext";

export default function BottomBar() {
  const { t } = useTranslation();
  const { formFields, deletedPages } = useWorkspace();

  const visibleFields = useMemo(
    () => formFields.filter((f) => !deletedPages.includes(f.pageNumber)),
    [formFields, deletedPages]
  );

  return (
    <div
      style={{
        height: "22px",
        backgroundColor: "#252526",
        borderTop: "1px solid #3e3e42",
        display: "flex",
        alignItems: "center",
        padding: "0 1rem",
        flexShrink: 0,
        fontSize: "0.75rem",
        color: "#cccccc",
        gap: "1rem",
      }}
    >
      <span>{t("fieldsLoaded", { count: visibleFields.length })}</span>
    </div>
  );
}
