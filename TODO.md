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
  - additional system info widgets <-- careful not to make too many "techy" widgets - maybe wait until better category system w/ subcategories and disclosures so as not to overwhelm users/bury ones they might want under a million variations on system stats etc.
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
  - searchbar widget (google, duckduckgo, bing, etc.)
  - tracker widget (e.g. numeric input, either a sparkline or a progress bar, or both, or something else)
    - possibly a ETA or projected completion date based on current/average/historical rate of change
  - countdown/timer widget (countdown to a date, or count up from a date, or a timer that counts down from a set time)
    - specialization for pomodoro timers and related? scheduled/patterns? maybe worth a distinct widget for this, with a few presets and a simple UI for setting up custom patterns
  - integrations
    - pending webrequest handler and caching layer, and probably needs a relay server to handle OAuth2 flows and keep dev keys secret
    - todoist (maybe special-case the todolist widget for this)
    - spotify (media integration and this overlap, but depends what spotify allows)
    - discord?
    - various social medias (twitter, reddit, etc.) - depends on specifics of API's and what data is available. compilcated by RSS feeds duplicating some functionality, but not all. e.g. reddit has a json feed, but twitter does not, and the twitter API is very limited now. so some social media may be better served by RSS feeds, others by direct API integration. maybe some sort of tutorial or guide on which flavour works best? maybe media-specific widgets just use whatever i consider the "best" way to get the data, but user can create RSS pointing at the same data if they want to
  - webhook/arbitrary http request widget? how to display arbitrary data? 
    - accept a selector pointing at a simple datatype (number, string, boolean) in response?
    - format string with {object.property} style placeholders for simple objects, or {array[0]} for arrays, etc.? <-- i like this
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
- Webrequest handler
  - waiting on file-persistence and caching layer to be implemented first, so that the webrequest handler can cache responses and persist them across app restarts
- widget plugin system
  - how to find/load plugins? (local folder, remote repo, etc.)
  - management of plugin dependencies and versions
  - security considerations for running untrusted code in plugins
  - internal API exposure, needs to be well-defined and stable, with clear documentation for plugin authors
  - see also: [widget plugins](gitignore/plugin-system-design-summary.md) and [native plugins](gitignore/native-abi-plugin-design-summary.md.md) planning docs

## Refinements - improvements to existing features or code quality

- forward state of `dev` cli arg to frontend for dev-only features (e.g. dev-only debug panel, config and storage purge/management, etc.)
  - extra settings page?
  - maybe compile-time flag as well/instead, to keep dev-only code out of production builds
- file.rs atomic writes all use the same tmp.json extension, which means concurrent writes to different files can collide and corrupt each other; need to use a unique tmp file per target file
  - linked, probably needs a mutex for files to keep contention explicit rather than relying on the filesystem to handle it
  - while at it, cache directory/file handles, maybe make them singleton (keyed on path) so that only one handle exists for any given filesystem path
- add widget modal needs better search/sort/filtering, and maybe a "recently used" section
  - even with only a handful of widgets, the list is already long enough to be unwieldy; with more widgets it will be worse
  - maybe a "favourites" section for widgets you use often, or a way to pin widgets to the top of the list
  - more thought needed on how to work with tags, categories etc.
    - hierarchial categories? e.g. "media" -> "music" etc.
    - concurrent 'vibe' tags? e.g. "aesthetic" or "minimalist" or "retro" etc.
      - sits alongside the functional tags like "requires setup" and "customisable"
      - probably needs a specific callout that these are subject to customisation and may not be accurate for setups
    - hide filters with no results!! (progressive disclosure)
- hijack button titles to look better than UI native hover tooltips
  - Needs dedicated tooltip component
- Extend the gen-licenses script to try pull license text from the package's repository (what if malformed?), and NOTICE files (for Apache-2.0 licenses specifically, but maybe all licenses if such a file exists?) <-- overengineering?
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
- the widget harness (suspense, error boundary, placement, etc.) is split between the `Widget` component and the registerWidget wrapper
  - this should ideally be consolidated, possibly into a single file, so that ordering is clear and consistent
  - needed for custom error components to be used in the error boundary (via same mechanism as the loading component is currently passed in)
- onboarding needs lots of updates
  - order of window controls is wrong, should go left-to-right, currently jumps around as order has been changed a few times during development
  - there are more targets that need to be added
  - language feels slimy - prefer more neutral than the current "im your friend" vibe
  - more stages/trigger in more contexts
    - tour for making/editing layouts
    - tour for customizing themes
- font scale need proper setup
  - probably involves a lot more measurements being in rem/em instead of px, and a root font-size being set on the body based on the font scale setting
- LayoutSection/ThemeSection settings pages have a lot of duplicated CSS that should probably be shared primitives/components instead of unique theming per section
  - LayoutSection.module.css has a block explicitly marked "Copied verbatim from ThemeSection.module.css" plus a couple other classes that are fully dead now, and a gridPreview/gridSettings block that doesn't seem to be wired up to anything - not sure if that's abandoned or half-built, check before ripping out
- unify themes and ui css, so all components can be used in either context
  - provides more colour tokens for widgets to use
  - allows for more consistent styling across the app, and reuse of already extant components
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
    - mask album art with visualiser bars?
    - maybe add combined albumart + visualiser widget with visualiser bordering(inset and outset) the album art? circular?
- themes need additional colors:
  - secondary accents?
  - graphics (i.e. for the visualizer, accent is too aggressive for the bars, maybe a more muted secondary accent for graphics?)
  - potentially, remove colours, move to one or two accent colours and a graphics colour, and let the visualiser and other graphics use that instead of the accent colour, which is more for text and UI elements, makes themes less powerful, but possibly better aesthetics since no longer fighting so hard against "bad" themes/managing 12 colours per theme for 10 themes, and less work for the user to create a theme that looks good. also reopens custom themes to be more tractable for non-technical users, since they only have to pick a few colours instead of 12.
- theming system needs a broader overhaul (in progress) — at least two known issues are symptoms of this rather than worth fixing standalone:
  - `generate_theme`'s `color_scheme` is still computed with the old literal comparison (`if 0.12_f64 < 0.5`) instead of the `dark` param, so both variants save `color_scheme: "dark"`
  - generated themes do something seriously weird when setting colours, seems like events stack up then fire all at once
- edit mode placement ghosts are very saturated, need higher transparency (maybe stronger border to make them more visible on light backgrounds)
- Edit mode needs significant updates, see [planning doc](gitignore/edit_layout_overhaul.md)
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
- App manages one big state object for some channel state, but other channel state is managed separately in distinct app.manage calls
  - this is inconsistent and makes it hard to reason about the state of the app, especially when trying to debug issues with channel state
  - rather have state-per-channel, maybe switch to channel trait/structs?
    - trait has associated types State & Event (& Runner? thread::JoinHandle vs. tokio::task::JoinHandle)
    - trait has methods for:
      - starting/interacting with the loop
      - adding/removing subscribers
      - some dev affordances? (reset, dump state, etc.)
    - struct can own handle to the thread/async task it runs on
    - api becomes more like: app.manage(SystemChannel::new())

## Bugfixes - issues with existing features or code

- if licenses file is missing, dev build wont run, and the gen-licenses wont run without cargo-about
  - in dev mode specifically, this can be ignored, but in production mode it should be a hard error and the app should not run without a valid licenses file
- some widget wrapper styles reach into the widget and override its styles (setting width and height specifically). should not do that (some fixes however: box-sizing: border-box etc global styles already applied, should this be removed from the global styles and applied per-widget instead? probably yes, but needs a careful review of all widgets to ensure they don't break, and documentation for widget authors on how to handle sizing and layouting)
- channel/event architecture needs a broader overhaul, see [planning doc](gitignore/channel_architecture_overhaul.md) — high-frequency emits from the visualizer causing OOM is a symptom of this rather than worth fixing standalone
  - unconfirmed cause, but prior art exists (<https://github.com/tauri-apps/tauri/issues/8177>) and makes sense given context
    - realtime FFT audio capture triggers emits regardless of system state
    - if screen turns off or the app is backgrounded, the events don't get consumed
    - on wake, the backlog of events is processed, which can cause a spike in memory usage and potentially OOM
  - window-visibility/focus-based pausing (actually stopping streams when backgrounded, vs. just capping backlog) is a distinct follow-up, not covered by the overhaul doc
  - `pnpm check-events`, which CLAUDE.md documents and `pnpm build` already invokes, doesn't actually exist as a script anywhere — currently a dead/broken reference, independent of the overhaul
- devtools console always says backend log level is "info"
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
  - clear and reset to defaults?
  - zod or similar? <-- probably a good idea for multiple things, worth investigating re: persistence/webreq to catch bad shapes
- todolist widget does not have proper ordering semantics/behaviour
  - probably the serde roundtrip from file -> serde -> IPC -> widget parsing then IPC -> serde -> file is losing the ordering of the items

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
