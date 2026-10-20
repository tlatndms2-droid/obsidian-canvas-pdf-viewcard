# 0.1.1 keyboard regression validation

Validated the final 0.1.1 build in the isolated Windows Obsidian 1.14.4
Sandbox, then repeated keyboard checks after a full process restart.

- TypeScript check, production bundle and five model tests passed.
- Actual PDF clicks, page-button clicks and page input followed by Enter
  retain reading focus. Left/Right and Page Up/Down change the PDF page
  without changing the node coordinates or Canvas viewport.
- Up/Down, Shift+arrow keys and Ctrl+Right do not move the card while reading.
- Numeric input editing does not nudge the card.
- Popup keyboard navigation leaves the card page and position unchanged;
  Escape closes the popup.
- Clicking the filename restores native Canvas arrow-key movement.
  Clicking back into the PDF restores reading-key protection.
- Restart preserves all saved card/popup settings and Canvas node data.
  Visible cards restore their corresponding saved page and view settings.
- Test-induced position and page changes are restored to the pre-test state.

The automated runtime regression is `scripts/validate-keyboard.cjs`.
The check targets the isolated Sandbox; unrelated third-party Canvas
extensions and the user's production vault were not part of this run.

# 0.1.0 validation

Validated on Windows in an isolated Obsidian Sandbox. Initial runtime was
Obsidian 1.12.7; the app applied its pending update during restart. The final
build was checked again on Obsidian 1.14.4.

## Passed

- TypeScript check, production bundle, five model tests.
- Existing cards preserve page links; duplicate PDF cards retain independent pages.
- Four layouts, whole-page fit and width fit in both card and popup.
- Page number input, previous/next buttons, popup zoom controls.
- Double click opens the card page; popup navigation leaves the card unchanged.
- Popup view preferences are remembered, with start page always taken from card.
- PDF raster pixels verified in the reopened popup, including dark theme.
- Selected-card wheel scrolling and Canvas navigation outside cards.
- Native label dragging and corner resizing through pointer interaction.
- Newly created PDF card automatically receives the new viewer.
- Portrait and landscape documents; resize-driven fit.
- Normal PDF tabs retain the native viewer.
- Invalid PDF error and retry UI.
- Existing Canvas connection and file/page references preserved.
- Disabling the plugin recreates the native PDF toolbar and document.
- Full process restart restores plugin 0.1.0, card/popup settings and Canvas data.
- Final source and Sandbox installation hashes match for all three release assets.
- Public 0.1.0 release downloads match the validated local assets by SHA-256.
- BRAT 2.2.0 registered and downloaded the public repository's latest release;
  the plugin is active at 0.1.0 and its popup was exercised after installation.
  JavaScript and CSS match byte-for-byte. BRAT rewrites the manifest's JSON
  whitespace; parsed manifest fields match exactly.

The test fixtures use generated 12-page PDFs. Very large production documents,
mobile Obsidian and unrelated third-party Canvas extensions were not tested.
