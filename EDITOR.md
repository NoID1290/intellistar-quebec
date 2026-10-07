# IntelliStar Studio

Open **http://localhost:7070/editor.html** after starting the IntelliStar server. Studio is also linked from the visual preview toolbar and the viewer's settings screen. If the server was already running when Studio was installed, restart it once and reload the viewer to load the new API and runtime integration. A standalone static server cannot save presets.

## Workflow

1. Studio opens a copy of the effective broadcast configuration. Give it a descriptive name.
2. Edit **Slides**, **Cities**, **Settings**, or canvas layers. Nothing is published while editing.
3. **Save preset** stores the workspace on the server. **Save as…** creates a separate preset.
4. **Apply to broadcast** validates, saves and publishes a snapshot after confirmation. Connected viewers with the Studio runtime reload within three seconds. This reload can briefly interrupt playback while weather data initializes.
5. **Presets → Restore base broadcast** removes the active overlay and returns to the original configuration. It does not erase saved presets or the editor's unsaved work.

The original configuration is never overwritten. Saving a changed version of an active preset does **not** update its published snapshot; explicitly apply it again.

## Slides

- Add any supported broadcast program, duplicate or remove entries, drag cards to reorder, or use the up/down controls.
- Enable/disable entries without deleting them. At least one entry must remain enabled.
- Set duration per page (1–300 seconds) and page count. Multi-page programs use their existing pagination rules; map forecasts distinguish forecast periods from city pages. Counts beyond available data do not generate extra weather.
- Manual mode uses this sequence. Automatic flavor mode uses the simulator's flavor library instead; Studio warns when it is enabled.
- Closing attribution can be enabled/disabled separately under **Settings → Slide**, with its own duration in milliseconds.
- Preview playback cycles through enabled sequence entries using their durations. It is a layout preview, not a live weather/data simulation.

## Cities, maps and radar

The Cities tab edits the main city, nearby cities, regional forecasts, Canadian cities, Québec cities, resorts, regional map cities, local/regional radar labels, and all local Doppler areas. Add, duplicate, delete and reorder locations. Existing fields are preserved.

- Geocodes use `latitude,longitude`; latitude must be −90…90 and longitude −180…180.
- Main city uses manual geocode mode, as required by the existing weather loader.
- Radar areas expose latitude, longitude, name and zoom.
- Regional maps expose frame offsets, zoom scale, cities per slide and individual city coordinates.
- On a map, click/drag a city label to move the entire city group. This changes that city's actual map coordinates. Hold **Alt** while selecting to edit a child label/icon instead.
- Use **Preview page** in the inspector to inspect later city pages. It does not alter the saved sequence or data.

Coordinate entry is local and deterministic; Studio does not send searches to an external geocoder. Real weather fetching remains the viewer's responsibility.

## Canvas and layers

The 1620 × 1080 canvas uses the real viewer markup and selected theme. Sample weather is explicitly labelled; radar imagery is represented by a placeholder. The viewer's existing horizontal stretch to 16:9 remains unchanged.

- Click to select; drag to move; use the bottom-right handle to resize.
- Arrow keys nudge by one native pixel; **Shift+Arrow** nudges by ten.
- Grid snapping uses ten native pixels. **Alt** during dragging temporarily bypasses it.
- The inspector edits position, size, rotation, stacking, visibility, font, line height, spacing, alignment, opacity, colors, corners and artwork.
- The searchable layer tree includes hidden elements and allows selecting parent containers.
- Add custom **text**, **image** and **panel** layers. Each can belong to the current slide type or appear on every slide.
- Artwork references local assets under `images/`. External URLs, scripts and arbitrary CSS are not accepted. New artwork must first be placed in that asset directory; Studio does not upload files.
- Static text and icon overrides are opt-in. **Pin text** replaces live data for that layer, so avoid pinning temperatures or alerts unless intentional. Text is inserted literally, never as HTML.
- Layouts are shared by slide type and DOM slot, not by sequence occurrence. Repeating a slide uses the same design. Individual map-city coordinates are saved per city rather than per slot.
- The grid, safe-area guides, sample data and selection handles never appear in the broadcast. Global custom overlays appear above normal slide contents, including attribution.

LDL visibility and type are in Appearance settings. When type is `both`, odd/even preview pages alternate sample observations and crawl. Runtime retains its normal LDL scheduling.

## Settings, history and portability

Settings exposes every field in the supported appearance, slide, audio, location and alert-test sections, including nested collections. **Advanced JSON** supports less common fields and whole-preset editing with the same validation used on save. Spotify/API credentials remain outside portable presets; configure those through the existing app mechanisms.

- **Ctrl/Cmd+S** saves.
- **Ctrl/Cmd+Z** undoes; **Ctrl/Cmd+Shift+Z** redoes, up to 100 editing steps.
- **Space** toggles sample playback when not typing; **Escape** clears selection.
- Unsaved work triggers a leave/discard warning. Saving to the server is the durable recovery mechanism; unsaved drafts are not stored in browser storage.
- Import/export uses versioned JSON with configuration, layout overrides and custom layers. Imports create unsaved copies and never publish automatically.
- Concurrent edits are detected on save: reload a preset if another editor has saved a newer version. “Save as” can preserve a conflicting local copy.

## Storage and operation

By default the library and published snapshot are stored atomically in a single private-permission JSON file inside the project-level `presets/` directory (created on first save). Back up that directory. Set `INTELLISTAR_PRESET_DIR` to use another persistent directory. The library and active snapshot survive a server restart.

Studio API is under `/api/editor`: `GET /current`, `GET /state`, `GET /presets/:id`, `POST /presets`, `PUT/DELETE /presets/:id`, `POST /presets/:id/apply`, and `POST /restore`. Mutation endpoints require JSON, reject cross-origin browser requests, and limit payloads to 2 MB. Validation excludes executable CSS and credentials.

**Trusted network only:** like the existing simulator control APIs, Studio does not implement user accounts. Anyone with network access to the server can manage presets. Do not expose the server directly to the public internet; use firewall rules or an authenticated reverse proxy. Do not run multiple writer processes against the same preset directory.

## Verification

`npm test` includes schema/coordinate validation, CSS safety, configuration normalization, atomic persistence, restart recovery, active snapshots, rollback, disabled slides, custom layers, conflict detection and API origin/payload handling. Browser checks additionally cover selecting, dragging, resizing, custom text, city edits, save/reopen, and applying layout/text overrides to an isolated copy of the live DOM without fetching weather or changing the running stream.