# TODO's

## Extensions - new features

- setup tray icon and menu for quick access to settings etc.
- add more widgets
  - vendor-specific adapters for advanced CPU/GPU/RAM/thermal data
    - needs bindings to AMD & intel driver, testing on nvidia and intel hardware
    - consider open/libre hardwaremonitor integration for this, sidecar? kernel tho :(
  - More variety of datetime widgets
  - weather widget with forecast
    - openmeteo
  - additional system info widgets
    - battery/power info
    - disks/storage info
    - extend network widget to show current network etc
    - SMART data for disks?
- additional options
  - lock dashboard via tray menu or something, prevents window controls from showing or edits being made (tauri set_ignore_pointer_events or similar)
    - keyboard shortcut? window only or global?
  - complete run on startup and similar options
    - tauri has a plugin for this
  - initial setup/onboarding flow?
    - maybe a quick tutorial on how to add widgets, or a link to the wiki for that
    - overlay?
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

- remove Spotify integration
  - `get_high_res_album_art` was never registered in the Tauri invoke handler and has no TypeScript caller
  - Remove `SpotifyClientAuth`, `SpotifyAccessToken`, `request_token`, `get_high_res_album_art` from `media/mod.rs`; remove `use serde_json::Value`
  - Remove `spotify_auth`, `spotify_api_token` fields from `AppStateInner` in `lib.rs`; remove hardcoded credentials (lines 279–282) and the `use crate::media::{SpotifyAccessToken, SpotifyClientAuth}` import
  - Remove `reqwest` from `Cargo.toml` (only user of it)
- dual-mode theme generation
  - `generate_theme` currently always generates a dark palette regardless of seed colour; the `color_scheme` ternary (`if 0.12_f64 < 0.5`) is a literal always-true comparison
  - Replace with dual generation: one dark variant (base L=0.12, text L=0.92) and one light variant (base L=0.97, text L=0.15), both using the seed's hue and clamped chroma; accent L clamped per-mode for legibility
  - IDs: `_generated_dark` / `_generated_light`; names: `"{HueName} (Generated — Dark)"` / `"{HueName} (Generated — Light)"`
  - Write both to disk; set neither as active — user picks from the themes list
- Extend the gen-licenses script to try pull license text from the package's repository (if malformed?), and NOTICE files (for Apache-2.0 licenses specifically, but maybe all licenses if such a file exists?)
- explicit error path on malformed config/layout/theme/etc., with user-friendly error messages and fallback to defaults
- ranges should accept steps
  - esp for things like font size, and use in widget settings where it makes sense (e.g. quote widget frequency)
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

- widgets should have an error boundary to contain issues and keep local problems from affecting the whole app
  - should explain the error and offer options to reset the widget or open settings to fix it
- widget backgrounds should properly border the actual widget content, to maximise legibility over transparent backgrounds + complex wallpapers
  - flat backgroudn on widget class results in unintuitive background shapes and sizes, especially with padding and gaps
  - separate background layer? (allwos for backdrop effects and such in the future maybe) that is sized to the widget content (+ padding?), and respects border radius settings if/when those are added
- Widget settings panel needs better placement, currently covering the entire widget and making it impossible to see the changes as you make them; ideally it should be anchored to the widget but not obscure it, maybe a sidebar or a floating panel that tries to position itself intelligently around the widget
- cursor is not `cursor: grabbing` during drag/resize while in edit mode, should be for better UX feedback
- add showWhen to select options e.g. certain options may only be relevant when some other non-trivial setting is set (e.g. media visualiser when circular can mirror over one axis but both has little meaning for a circular visualiser)
- visualiser needs fixing for the new settings system, currently broken for lots of settigns combinations
- visualiser has some overlapping/missing bars in certain mirroring/flip combinations, needs a careful review of the bar drawing logic to ensure all bars are drawn and correctly positioned in all configurations
- onboarding should use the demo layout, to point out different configurations of the same widget etc.
- settings def should have optional `description` field, renders (i) icon with tooltip in settings panel
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

## Bugfixes - issues with existing features or code

- visualizer FFTStream thrashing on subscribe/unsubscribe cycles — edit-mode → standard-view transitions unmount then remount the visualizer widget, firing unsubscribe + subscribe in quick succession; each cycle tears down and recreates the WASAPI loopback stream and real-time audio thread. Confirm old stream and callback handles are fully closed before the new stream opens (no handle leak across cycles). Consider caching the live `FFTStream` for a short grace period before tearing it down, so rapid re-subscriptions reuse the existing stream.
  - Possibly extend to other streams, e.g. media subscription, if similar thrashing is observed there
- Some inconsistencies found with when stream are opened and closed across layout edit boundary, needs investigation as to when widgets are actually broadcasting subscribe/unsubscribe events, and whether any streams are left open unnecessarily or fail to reopen when needed
- widget settings null on layout load — covered by the widget settings type system overhaul refinement (`collectDefaults` + `coerceSettings` at layout load time)
- properly define and enforce the widget min/max sizes in the registry and edit grid, currently they are just ignored and any widget can be resized to any size
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
