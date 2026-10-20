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

The test fixtures use generated 12-page PDFs. Very large production documents,
mobile Obsidian and unrelated third-party Canvas extensions were not tested.
