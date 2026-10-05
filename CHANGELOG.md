# Changelog

All notable changes to PDF Form Editor are documented in this file.

## [0.3.0] - 2026-10-05

### Added
- Open PDFs from the command line (`pdf-form-editor file.pdf`); the app registers itself as a PDF handler on Linux.
- AppStream metadata so Discover and GNOME Software show the app name and developer.
- COPR spec file for building Fedora packages (`packaging/copr`).
- Font size `0` in the property inspector means "auto": the PDF viewer fits the text into the field.

### Fixed
- Note fields (text fields with a background color, like Acrobat's highlighted notices) now look in the editor as they do in the PDF: background color, text color, and wrapped, centered multi-line text.
- Auto-sized text fields are no longer saved with a fixed 12 pt font, which cut off longer text. Inherited font settings from the form's default appearance are now preserved.
- Desktop entry: removed a template condition that broke the `Comment` line.
- RPM package now carries a vendor tag.

## [0.2.0] - 2026-07-26

### Added
- Signature placeholders become real AcroForm signature fields.
- Packaging metadata improvements.
