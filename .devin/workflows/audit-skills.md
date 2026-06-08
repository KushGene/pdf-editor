---
name: audit-skills
description: Auditiert den bestehenden Code gegen ein bestimmtes Skill/Rule. NUR Befund, keine Code-Änderungen, keine paste-fertigen Fixes. Trennt dokumentierte Verhaltens-Fallen + normative Standards von rein beschreibenden Skill-Teilen. Aufruf z.B. @audit-skills PdfEngine.md src/utils/buildPdfBytes.ts
---
 
# Skill Compliance Audit (report-only)
 
Goal: find places where the **code deviates from the skills/rules**, so a human can decide what to fix. This workflow **does not edit code** and **does not output paste-ready fix code**. It produces a findings report and stops.
 
## Inputs
- A target skill/rule file (e.g. `PdfEngine.md`). If none given, ask which one — do **not** audit all skills at once.
- The relevant code files. If unsure which, derive them from the skill's file references, list them, and confirm before reading.
## Hard rules for this run
1. **No code changes. No file edits. Read-only.**
2. **No paste-ready fix code.** Describe the target behavior and point to where the correct path is documented (skill section or a real call-site in the repo). Do NOT write the fix line — that is what invites invented APIs (a `create*` method that "completes the pattern" is the classic hallucination).
3. **Any API you mention must be proven or tagged.** If you name a library method/option, either cite its declaration (`node_modules/**/*.d.ts` line) or an existing use in the repo, OR tag it `UNVERIFIED` and explain you have not confirmed it exists. No proof and no tag → omit it.
4. **Every finding must cite `file:line` and quote the actual code.** No quote → not a finding → drop it.
5. **Verify by reading, not by building.** `tsc` / `npm run build` say nothing about skill compliance. Do not cite them as evidence.
6. **One skill / one area per run.**
## What to flag (and what NOT to)
Classify each skill claim before auditing:
 
- **Descriptive** (the skill documents what the code already does — coordinate formulas, import paths, worker config): derived from the code. Do **not** flag the code for "matching" them. Only flag if two code paths disagree with each other or with documented behavior.
- **Normative** (the skill prescribes a standard the code can violate): audit these.
### Behavioral traps to check (high value — real latent bugs)
- **Detached ArrayBuffer:** pdfjs (`getDocument`) and pdf-lib (`PDFDocument.load`) each get an independent copy, not the same buffer.
- **Konva context bridge:** any context read rendered inside a `<Stage>` without a bridged Provider (silent `undefined`).
- **Transformer scale-bake:** `onTransformEnd` resets `scaleX/scaleY` to 1 and bakes into `width/height`.
- **Worker version pinning:** copied `pdf.worker` version tied to the installed `pdfjs-dist` version, not free to drift.
- **FormField completeness:** every property in `FormField.ts` handled in BOTH `PropertyInspector` AND `buildPdfBytes`. A property handled in one but ignored in the other = silent data loss → flag. (Also flag any field `type` with no creation/update branch in `buildPdfBytes`.)
- **Delete-key guard:** the global Delete/Backspace hook does not fire while focus is in a text input.
### Normative standards to check
- `any` / `as any`; untyped props/state.
- Byte-generation or coordinate math inside a component instead of a pure util.
- `formFields` mutations bypassing the history-aware setter.
- Files outside their conventional directory; naming violations.
- Node `fs`/`path` in frontend; hardcoded OS paths; Tauri v1 import paths.
## Output (write to `audit-<skill>-<date>.md`, do not touch source)
One row per finding:
 
| # | file:line | Skill ref | Type (trap/normative) | Severity | Code quote | Why it deviates | Target behavior / where documented |
 
If a row references a library API in the last column, it MUST carry a proof pointer or an `UNVERIFIED` tag (rule 3).
 
After the table: a 2–3 line summary (count by severity; anything you were unsure about; any finding that is actually a product decision rather than a bug). Then **STOP**. Do not start fixing.
 
## Next step (separate, human-gated)
The human triages, then runs `@apply-fix` on ONE approved finding at a time. Product decisions (e.g. "what should a signature field be") are decided by the human BEFORE any fix — they are not patched blindly.