# TODO's

## Extensions - new features

- setup tray icon and menu for quick access to settings etc.
- add more widgets
  - vendor-specific adapters for advanced CPU/GPU/RAM/thermal data
    - needs bindings to AMD & intel driver, testing on nvidia and intel hardware
    - consider open/libre hardwaremonitor integration for this, sidecar? kernel access needed though
  - More variety of datetime widgets
  - weather widget with forecast
    - openmeteo
  - additional system info widgets
    - battery/power info
    - disks/storage info
    - extend network widget to show current network etc
    - SMART data for disks?
  - quotes (unifinished, needs API options nailed down)
  - todo list widget
  - calendar widget
  - RSS feed widget
    - maybe special-case for certain feeds like reddit (using .json feed)? to get better quality data than the generic RSS feed
  - news widget (maybe via specialised RSS feed, or via newsapi.org)
  - picture widget (APOD, or user-specified image feed)
    - needs provider
    - options include stock photo feeds, user-paid api's, APOD (NASA) (Also satelite imagery, weather maps, etc.)
    - additional options
- lock dashboard via tray menu or something, prevents window controls from showing or edits being made (tauri set_ignore_pointer_events or similar)
  - keyboard shortcut? window only or global?
- initial setup/onboarding flow?
  - maybe a quick tutorial on how to add widgets, or a link to the wiki for that
  - overlay?
- Add a plug-in system for MCP or other AI-assisted widgets
  - "recent Claude session" widget — via MCP, surface what the last active Claude conversation was with a resume button/link
  - "Claude context" widget — expose a snippet of Claude conversation history as a text block (e.g. a summary paragraph or a bullet list of recent topics)
  - global to-do integration — speak to Claude ("add this to my to-do list") and have it write back to the app via MCP; widget surfaces those items on the desktop
  - general widget command palette — a handful of preset MCP actions you can trigger from the overlay (add reminder, log a note, query Claude, etc.)
- compilation and packaging for distribution
  - needs github actions for merge -> compile -> release pipeline
  - need to set up proper branching strategy
- complete CI/CD pipeline with testing, linting, etc.
  - unit tests for Rust code; integration tests for Tauri API and overall app behaviour; snapshot or visual regression tests for React components and layouts
  - linting with clippy for Rust and eslint for TypeScript, with strict rules to enforce code quality and consistency
  - build
  - releases
  - needs versioning strategy and changelog management

## Refinements - improvements to existing features or code quality

- hijack button titles to look better than UI native hover tooltips
  - Needs dedicated tooltip component
- remove Spotify integration
  - `get_high_res_album_art` was never registered in the Tauri invoke handler and has no TypeScript caller
  - Remove `SpotifyClientAuth`, `SpotifyAccessToken`, `request_token`, `get_high_res_album_art` from `media/mod.rs`; remove `use serde_json::Value`
  - Remove `spotify_auth`, `spotify_api_token` fields from `AppStateInner` in `lib.rs`; remove hardcoded credentials (lines 279–282) and the `use crate::media::{SpotifyAccessToken, SpotifyClientAuth}` import
  - Remove `reqwest` from `Cargo.toml` (only user of it)
- Extend the gen-licenses script to try pull license text from the package's repository (if malformed?), and NOTICE files (for Apache-2.0 licenses specifically, but maybe all licenses if such a file exists?)
- explicit error path on malformed config/layout/theme/etc., with user-friendly error messages and fallback to defaults
- better client-specific handling for media - replace is_apple_music with client enum, and add methods to pre- or post-process media data based on client
  - e.g. for youtube _videos_ we can display the youtube logo on/instead of album art, and maybe use the channel art instead of album art for better results?
  - maybe add a client logo/icon alot to relevant widgets and/or the media subscription? e.g. Playing &lt;song title&gt; via &lt;client logo&gt; etc.
- Modal has slightly weird semantics around titles/actions, rather have it accept something like:
  - a object/array of objects describing the buttons
    - ```tsx
      <Modal
        title="Title"
        actions={[
          { label: "Cancel", onClick: () => {}, variant: "danger" },
          { label: "OK", onClick: () => {} },
        ]}
      >
        Content
      </Modal>
      ```

  - title should be just text, but there can be an option for a custom header for more complex cases (e.g. the widget add/settings modal)
  - presets? (more complex that warranted perhaps)
  - multiple layout/sizing options? small confirmation dialog vs full-page overlay for critical errors or onboarding etc.
  - should help the temptation to constantly special-case everything, rather have a consistent API for actions across the app
  - standardise certain actions like "Cancel"/"Close" that are used across the app, so they look and behave the same everywhere (or just a cross (X) close icon? needs explicit close handler for all windows regardless of other actions however, to prevent malformed/inconsistent data)
  - the "raised surface" recipe (bg/border/radius/shadow) is currently hand-copied independently across Panel, Modal, EditGrid's edit bar, and Onboarding's card - should consolidate into one shared base once this gets tackled
- EditGrid's icon/edge buttons still hand-roll their own CSS instead of using the Button primitive's ghost/ghost_danger variants - left alone for now since EditGrid needs a proper overhaul anyway
- LayoutSection/ThemeSection settings pages have a lot of duplicated CSS that should probably be shared primitives/components instead of unique theming per section
  - LayoutSection.module.css has a block explicitly marked "Copied verbatim from ThemeSection.module.css" plus a couple other classes that are fully dead now, and a gridPreview/gridSettings block that doesn't seem to be wired up to anything - not sure if that's abandoned or half-built, check before ripping out

- widget backgrounds should properly border the actual widget content, to maximise legibility over transparent backgrounds + complex wallpapers
  - flat background on widget class results in unintuitive background shapes and sizes, especially with padding and gaps
  - separate background layer? (allwos for backdrop effects and such in the future maybe) that is sized to the widget content (+ padding?), and respects border radius settings if/when those are added
- Widget settings panel needs better placement, currently covering the entire widget and making it impossible to see the changes as you make them; ideally it should be anchored to the widget but not obscure it, maybe a sidebar or a floating panel that tries to position itself intelligently around the widget
- cursor doesn't show `cursor: grabbing` during drag/resize in edit mode despite `.widgetOverlay:active` having the rule - something about the z-index stacking during drag means it doesn't actually take effect, needs a proper look. applys currently while hovering over a widget, but not while dragging it
- visualiser needs fixing for the new settings system, currently broken for lots of settigns combinations
  - overlapping/missing bars in certain mirroring/flip combinations specifically - needs a careful review of the bar drawing logic to ensure all bars are drawn and correctly positioned in all configurations
- onboarding should use the demo layout, to point out different configurations of the same widget etc.
- settings def should have optional `description` field, renders (i) icon with tooltip in settings panel or subtext below name
  - maybe warning field on setting it away from the default?
- currently no way to create new layouts except going into settings and duplicating an existing one
  - not clear to users that this is how you do it, and it's a bit clunky; ideally there should be a "New Layout" button in the UI somewhere that creates a new blank layout and switches to it immediately for editing
- Inputs should be further genericized to reduce boilerplate and enforce consistency; additional props for common patterns like "allow empty" (for text inputs) or "allow custom" (for selects) would be helpful to reduce the need for custom components for these cases
  - hover/detail text (seeting def description above) and error display for validation issues
- builtin layouts should be more targeted, i.e. a "media" layout with a few different media widgets, a "system" layout with CPU/GPU/RAM widgets, etc.
  - media
  - system
  - mixed/dashboard
  - aesthetic?
    - waiting on APOD/quote widgets to be added to have enough for this
- "Confirm discard changes?" popup in edit mode when trying to navigate away with unsaved changes
- Free-placement mode as an option?
  - just set an arbitrary number of rows and columns (note some collisions are O(n\*m) in rows/columns)
  - secondary renderer?
    - repurpose rwo/col/rowspan/colspan as absolute positioning and size in px instead of grid units?
  - look into faster geometric algorithms for collision detection/bounds
  - snap-grid option (measured in px not grid units) for free-placement mode to help with alignment?
- visualizer needs completion
  - horizontal bars
  - colour options
    - rainbow mode? (+ hue-rotate?)
    - pull from album art colours?
    - maybe add combined albumart + visualiser widget with visualiser bordering(inset and outset)/masking the album art? circular?
- themes need additional colors:
  - secondary accents?
  - graphics (i.e. for the visualizer, accent is too aggressive for the bars, maybe a more muted secondary accent for graphics?)
  - potentially, remove colours, move to one or two accent colours and a graphics colour, and let the visualiser and other graphics use that instead of the accent colour, which is more for text and UI elements, makes themes less powerful, but possibly better aesthetics since no longer fighting so hard against "bad" themes/managing 12 colours per theme for 10 themes, and less work for the user to create a theme that looks good. also reopens custom themes to be more tractable for non-technical users, since they only have to pick a few colours instead of 12.
- theming system needs a broader overhaul (in progress) — at least two known issues are symptoms of this rather than worth fixing standalone:
  - `generate_theme`'s `color_scheme` is still computed with the old literal comparison (`if 0.12_f64 < 0.5`) instead of the `dark` param, so both variants save `color_scheme: "dark"`
  - generated themes do something seriously weird when setting colours, seems like events stack up then fire all at once
- edit mode placement ghosts are very saturated, need higher transparency (maybe stronger border to make them more visible on light backgrounds)
- Edit mode needs significant updates, see [discussion file](gitignore/edit_layout_overhaul.md)
- editing layouts should have a name field, so the user can rename the layout without having to go into settings
- visualiser "No audio data" message is extremely ugly and not very legible, needs a better design
- per-widget error handling
  - a callout in the corner rendered by the widget wrapper?
  - a handful of common error states (needs config, needs network, needs media, etc.) that widgets can declare and the wrapper handles rendering for them, so the widget doesn't have to implement its own error handling and can just declare what it needs
    - needs nailed down list of common error states and how they should be rendered, so the wrapper can handle them consistently across all widgets
    - porbably need some way for unique widget errors to be handled by the wrapper as well, so the widget can declare a custom error state and the wrapper can render it appropriately
- components/primitives need better sorting.
  - currently, ui chrome vs widget elements are mixed together
  - needs better split on true primitives vs composite elements (modal, panel etc.) and further split on ui chrome vs widget elements
  - should split as much styling into one place as possible to keep ui chrome in one place
- inputs & input groups need better layouting
  - three/four cols, label, input, detail text (unit etc.), error icon (with hover?)
  - set better alignment and spacing for these
    - left align input? better to associate label with input
    - maybe right align label for same reason, and maybe error to put it at edge of modal/panel instead of next to input? (needs hover for error details)
- visualiser idle animation does not exist despite setting existing for it, needs to be implemented
  - maybe a simple "pulse" animation on the bars when no audio data is present, to indicate that the visualiser is still active and waiting for audio data
  - configurable in the settings?
    - user can choose between different idle animations
    - pulse/breathe
    - wave (special-case for radial, so smoothly & continuously moves around the circle)
    - other?
- editgrid placement errors could be nicer, currently slightly too fast, or missing full-stop
  - tiers/other issues:
    - overlap has no flash
    - out-of-bounds has no flash
- tags are currently not automated the way i would like
  - customizable should be automatically added to any widget with a settingsDef
  - requires-setup should be automatically added to any widget that has a settingsDef with any required fields
  - other tags should be automatically added based on the widget's behaviour
    - pending mechanism for this, maybe widgets must request access to a manager for certain resources (media, network, etc.) and the manager can add the appropriate tags based on the widget's requests at registration time
- more tags
  - "needs network" for widgets with network dependencies?
  - think of others

## Bugfixes - issues with existing features or code

- visualiser stack style dows not work (confirmed horizontal bars, check other variants)
- fix broken settings
  - run on startup, taskbar/dock icon, tray icon toggles all exist in GeneralSection already but are non-functional stubs with no backend wiring - tauri has a plugin for run on startup specifically
- visualizer FFTStream thrashing on subscribe/unsubscribe cycles — edit-mode → standard-view transitions unmount then remount the visualizer widget, firing unsubscribe + subscribe in quick succession; each cycle tears down and recreates the WASAPI loopback stream and real-time audio thread. Confirm old stream and callback handles are fully closed before the new stream opens (no handle leak across cycles). Consider caching the live `FFTStream` for a short grace period before tearing it down, so rapid re-subscriptions reuse the existing stream.
  - Possibly extend to other streams, e.g. media subscription, if similar thrashing is observed there
  - possibly resolved?
- Some inconsistencies found with when stream are opened and closed across layout edit boundary, needs investigation as to when widgets are actually broadcasting subscribe/unsubscribe events, and whether any streams are left open unnecessarily or fail to reopen when needed
- widget settings null on layout load — covered by the widget settings type system overhaul refinement (`collectDefaults` + `coerceSettings` at layout load time)
- widget min/max sizes are defined per-widget in the registry now, and minSize triggers a non-blocking warning in edit grid, but nothing actually clamps/prevents a resize past it, and maxSize is defined on the type but unused everywhere - no widget sets one and no code checks it
  - pixels or grid units?
  - better api for responsive widgets maybe? i.e.small/wide/tall/big variants? hook into registerWidget (provide all variants and let the widget pick which one to use based on its size? - override manually?)
- really need proper handling of corrupted/out-of-date config/layout/theme files, very mixed behaviour depending on field and widget type; some fields are silently ignored, some cause errors, some cause silent fallback to defaults, etc. Should be a consistent approach across all fields and widgets, with user-friendly error messages and fallback to defaults where possible (e.g. unknown fields dropped with a warn log, wrong-typed values replaced with the setting's default if any and a warn log, otherwise dropped with a warn log)
  - different approach based on file?
    - config -> corrupt means significant bug, or user manually editing the file at own risk, warn and exit
    - layout -> corrupt means user lost their custom layout, but app is still functional, warn and display as unusable (maybe attempt recovery by pruning bad sections?)
    - theme -> corrupt means user edits, wipe and regenerate with a warn
  - assume edits were made, fail load, crash
  - assume edits made, best-effort recovery

## Dependency Updates

### Safe (no breaking changes)

**Rust:**

- `rustfft` 6.4.0 → 6.4.1 — accuracy bug fix in Raders twiddle calculations (u64 instead of smaller int); no API changes
- `sysinfo` 0.37.0 → 0.38.4 — Windows unsoundness fix in `Motherboard`/`Product`, Linux CPU parsing improvements; no API changes
- `windows` 0.62.0 → 0.62.2 — patch release; no breaking changes

**NPM** (`pnpm update` covers all of these):

- `@tauri-apps/api` 2.8.0 → 2.11.0 + `@tauri-apps/cli` 2.8.4 → 2.11.0 — new features only (scrollbar style, Android back button, WebView autofill); keep these two in sync
- `react` / `react-dom` 19.1.1 → 19.2.5 — all 19.2.x changes are React Server Components security hardening; no client-side impact
- `@react-three/fiber` 9.3.0 → 9.6.1 — React 19.2 compatibility in 9.5.0; ShaderMaterial uniform ref change in 9.6.0 is not relevant (project doesn't use ShaderMaterial directly)
- `three` 0.180.0 → 0.184.0 — `THREE.Clock` deprecated in r183, but the project uses its own `useClock` React hook, not three.js Clock; no other relevant breaking changes
- `react-error-boundary` 6.0.0 → 6.1.1, `react-icons` 5.5.0 → 5.6.0, `openmeteo` 1.2.0 → 1.2.3, `@types/react`/`@types/react-dom` minor bumps — all safe minor/patch

### Bump with small change required

- `cpal` 0.16.0 → 0.17.3 — "major API refactoring" in 0.17.0, but the APIs this project uses (`build_input_stream`, `DeviceTrait`/`HostTrait`/`StreamTrait`, `Device`/`Stream`/`StreamConfig`, `SampleFormat`) appear unchanged; WASAPI resampling added; needs a `cargo build` check before committing

### Hold — separate migration

- `typescript` 5.8.3 → 6.0.3 — strict mode on by default, ESM default, `"moduleResolution": "node"` deprecated, 9 tsconfig settings changed; treat as its own migration task
- `vite` 7 → 8 + `@vitejs/plugin-react` 4.7.0 → 6.0.1 — Vite 8 replaces esbuild+Rollup with Rolldown+Oxc; config renames (`rollupOptions` → `rolldownOptions`, `esbuild` → `oxc`); plugin-react 6 requires Vite 8 and drops Babel entirely in favour of Oxc; migrate together, official migration guide at [vite.dev/guide/migration](https://vite.dev/guide/migration)
