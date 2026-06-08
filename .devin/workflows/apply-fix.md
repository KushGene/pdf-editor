---
name: apply-fix
description: Behebt EINEN freigegebenen Audit-/Review-Befund pro Lauf — mit erzwungenem API-Existenzbeweis vor dem Schreiben und zwei Verifikations-Gates (tsc für Existenz/Typ, Verhaltenstest für Semantik). Aufruf z.B. @apply-fix "Finding #3: fontSize discarded in useAcroFormExtractor.ts:192"
---
 
# Apply Fix (gated, one finding per run)
 
Fix exactly **one** approved finding. The order of steps is mandatory — it is what forces the agent to look things up instead of pattern-completing a plausible-but-wrong fix.
 
## 0. Preconditions
- The finding is human-approved (real, in scope).
- If the finding is a **product decision** (e.g. "signature fields are dropped"), STOP — that is decided by the human first, not patched. Only implement once the chosen behavior is given.
## 1. Re-read
Read the actual code being changed and the relevant skill section. Do not work from the audit summary alone.
 
## 2. Prove every foreign API BEFORE writing it
For each library method/option/event the fix will use:
- Confirm it exists in the **installed** version: quote its declaration from `node_modules/<pkg>/**/*.d.ts`, or quote an existing use of it elsewhere in this repo.
- **No proof → do not write the call.** Stop and report: "API `x.y()` could not be confirmed in <pkg>@<version>; fix blocked." Suggest the documented alternative if one exists.
- A method that merely "fits the pattern" of neighboring calls (`createTextField` → `createSignatureField`) is the highest-risk case. Treat symmetry as a reason to verify, not as evidence.
## 3. Implement
- Minimal change for this one finding. No refactors, no new dependencies, no opportunistic cleanups.
- Preserve existing patterns (history-aware state updates, coordinate storage space, chosen worker setup).
## 4. Gate 1 — existence / types
`npx tsc --noEmit` must pass. This catches non-existent APIs and type mismatches (the class of error `createSignatureField` would be).
 
## 5. Gate 2 — semantics
The class of error `tsc` cannot catch (logic that compiles but is wrong — e.g. coercing PDF font size `0` to `12`):
- Add or extend a test (**Vitest** frontend, **Jest** backend) that **reproduces the bug first (red), then passes (green)** after the fix.
- For changes that are genuinely not unit-testable (visual rendering, native dialogs), state the concrete **manual behavioral check** you performed (e.g. "opened a PDF with a 0-fontSize field, confirmed it renders auto-sized, not 12pt").
## 6. Report (both gates, honestly)
State, for this finding:
- the diff,
- the API proof from step 2 (the `.d.ts`/call-site quote),
- Gate 1 result and Gate 2 result (test name + red→green, or the manual check),
- explicitly **what you did NOT verify**.
Never report "build runs" as sufficient. "Compiles + the new test reproduces and now passes; I have not checked rendering in Acrobat" is a good report.
## 7. Capture (institutional memory)
If the finding exposed a **recurring** trap (a non-existent API, a semantic gotcha like `0 = auto`), add ONE line to the relevant skill so it does not recur. Do not add speculative gotchas — only ones this fix actually proved.
 
## 8. Stop
One finding done. Do not continue to the next finding — return for the next `@apply-fix` so each diff stays reviewable.
EOF
