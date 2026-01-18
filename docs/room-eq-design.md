# Room EQ / Node Editor — Design Doc (One Lane per Channel, MVP-based)

This document proposes a complete implementation plan for the unfinished **Room EQ** feature (`/room`, `public/html/room.html`) as a **multi-lane visual pipeline editor**. Each lane represents one DSP channel, and the editor builds on the existing CamillaDSP config model and the current data shaping helper `camillaDSP.linearizeConfig()`.

The plan is intentionally incremental: each MVP ships something useful, and each step reuses/extends primitives from prior steps.

---

## 0) Goals, constraints, and non-goals

### Goal
Provide a **visual editor** for CamillaDSP processing layout that:
- Shows **one horizontal lane per channel**.
- Displays the chain **Input → Mixer(s) → Filters → Output** per lane.
- Lets users **create/edit/move/delete** filters and (later) mixers/processors.
- Can **round-trip** back into CamillaDSP config: UI → `DSP.config` → `DSP.uploadConfig()`.
- Allows future "Room correction workflow" (measurement → generate correction filters → insert them as a block).

### Constraints from current codebase
- The existing app's authoritative DSP state is `window.parent.DSP` (instance of `camillaDSP`).
- The underlying config supports:
  - `pipeline[]` ordered stages
  - `mixers{}` mixer definitions, referenced from `pipeline`
  - `filters{}` filter definitions, referenced by name in `pipeline` Filter stages
- There is already a robust filter editor component in `public/src/filter.js`.
- There is already a function that flattens config into per-channel "components": `camillaDSP.linearizeConfig()`.

### Non-goals (for MVPs)
- Actual microphone capture / FFT measurement / REW integration (later).
- A true arbitrary DAG editor (CamillaDSP routing isn't purely DAG; mixing and channel routing are special).
- "Canvas-based" rendering. The repo already has a working DOM prototype in `room.html`.

---

## 1) Current state analysis (what exists)

### `room.html`
A DOM-based prototype provides:
- draggable nodes (`.node`)
- connectors (`.connector.left` / `.connector.right`)
- lines (`.line`) drawn via rotated divs
- mouse interaction for:
  - drag node
  - drag connector to connect nodes
  - keep lines attached during node movement

**Missing:**
- no `DOMContentLoaded` hook currently enabled
- no integration with DSP config
- no persistence
- no per-channel lanes

### `advanced.js` pipeline viewer
`advanced.js` already uses:
- `DSP.linearizeConfig()` to render per-channel rows (`.pipelineChannel`)
- nodes are simple divs with text
- no editing / no wires

This is a major clue: **Room EQ should reuse the same "linearized components" concept**, but with editing affordances.

---

## 2) Proposed UX model (one lane per channel)

### Visual layout
- Editor is a scrollable area.
- Each lane is a "channel row" (like `advanced.js`) containing nodes arranged left-to-right.
- Each lane starts with an **Input node** and ends with an **Output node**.
- Between them are "processing blocks".

### Interaction model
We need to reconcile "graph edges" with CamillaDSP's actual configuration model.

CamillaDSP is essentially:
- Mixer stages (global-ish) and Filter stages (per-channel ordered name list).

So the UI should treat "connections" primarily as:
- **ordering** within a lane (linear chain), not arbitrary fan-in/out.

This suggests:
- Edges/wires are mostly decorative for a linear chain.
- User edits happen via:
  - adding a filter node at a position
  - deleting a node
  - reordering nodes
  - editing node parameters

Wires can remain for "future routing / mixer" work, but MVP should treat lanes as **ordered chains**.

---

## 3) Data model mapping

### A) Read model (DSP config → UI)
We should keep using `DSP.linearizeConfig()` as the canonical "read model" for the view.

It currently returns:
- `channels[channelNo] = [ {type: 'input', device}, {type:'mixer', sources}, {type:'filter', FilterName: def}, ..., {type:'output', device} ]`

We should extend/augment this in Room EQ (without breaking Advanced page) by deriving UI-friendly metadata:
- stable IDs
- filter names
- lane position

**Proposed normalized component shape in Room EQ:**
```js
{
  id: string,                  // stable in UI session
  type: 'input'|'mixer'|'filter'|'output'|'processor',
  channelNo: number,
  configRef?: {                // where does this live in DSP.config
    kind: 'device'|'mixerMapping'|'filter',
    name?: string,             // filter name or mixer name
    channel?: number
  },
  label: string,
  payload?: any                // e.g. filter parameters preview
}
```

For filters specifically:
- `configRef.kind='filter'` and `configRef.name = filterName`

### B) Write model (UI edits → DSP config)
There are 3 classes of edits:

1) **Filter list edits** (most important)
- Add filter
- Remove filter
- Reorder filters

These map to:
- `DSP.config.filters` and
- the channel's pipeline filter stage: `pipeline(Filter, channel=X).names[]`

2) **Mixer edits** (later MVP)
These map to:
- `DSP.config.mixers[mixerName].mapping[dest].sources[]`

3) **Pipeline stage edits** (later MVP)
Changing the global pipeline ordering or inserting new stages.

**Important restriction:**
Because the current code assumes a certain pipeline structure (default pipeline includes mixer + per-channel filter stages), MVPs should avoid changing `pipeline[]` ordering until we intentionally design that.

---

## 4) MVP roadmap

### MVP 1 — "Room EQ as a read-only multi-lane pipeline viewer (with wires)"
**Goal:** Make `/room` useful immediately and align with the existing prototype.

**Features**
- On load:
  - connect to `window.parent.DSP`
  - `await DSP.downloadConfig()`
  - `const channels = DSP.linearizeConfig()`
- Render:
  - one lane per channel
  - nodes laid out automatically (no free drag required)
  - wires drawn between consecutive nodes
- Node visuals:
  - input/output show device name + format
  - filters show filter name + key parameters (type/freq/gain/q)
  - mixer shows source summary

**Why this MVP matters**
- It validates the channel-lane concept.
- It reuses `linearizeConfig()` (no new DSP logic).
- It gives a foundation for later editing.

**Implementation notes**
- Use DOM nodes (divs) for nodes; lines can be DOM (rotated div) or SVG.
- Prefer deterministic layout: compute x positions by index (like `advanced.js`).

**Deliverables**
- `room.html` updated to actually run on DOMContentLoaded.
- New `public/src/room.js` (recommended) to keep JS out of HTML and match project patterns.

---

### MVP 2 — "Filter node editor per channel (add/edit/delete), still ordered chain"
**Goal:** Allow "Room EQ" to edit the chain in a controlled way.

**Features**
- Clicking a filter node opens an editor panel (side panel or modal) using the existing filter component:
  - instantiate `new window.filter(DSP)`
  - `filter.loadFromDSP(filterName)`
  - `filter.createElementCollection(false)` (advanced-style)
- Add filter:
  - context menu "Add filter after"
  - create a default filter using `DSP.getDefaultFilter()` or a new helper
  - insert it into the correct `pipeline Filter channel.names[]` position
- Delete filter:
  - remove from channel pipeline via `DSP.removeFilterFromChannelPipeline(filterName, channelNo)`

**Persistence**
- Every edit calls `await DSP.uploadConfig()`.
- After upload, re-render lanes from `linearizeConfig()`.

**Constraints**
- Only edit filters in the per-channel Filter stage.
- Do not edit mixers / pipeline[] yet.

**Deliverables**
- Room page becomes a functional editor for per-channel correction chains.

---

### MVP 3 — "Reordering and grouping (drag-and-drop within a lane)"
**Goal:** Make node graph editing feel like a true node editor, while still mapping to CamillaDSP's linear filter list.

**Features**
- Drag a filter node left/right within its lane to reorder.
- Drop position determines index in `pipeline Filter names[]`.
- Visual placeholder during drag.

**How it maps to config**
- Reorder is just list manipulation:
  - remove `filterName` from `names[]`
  - insert at new index

**Edge cases**
- Dual-channel mode in the rest of app sometimes duplicates filter names with `__c0/__c1`.
  - In Room mode we should be explicit:
    - either always operate on per-channel names as stored (including `__cX` suffix)
    - or optionally provide a "link channels" mode (later)

**Deliverables**
- Room EQ becomes the easiest way to reorder room correction filters.

---

### MVP 4 — "Mixer editing as a routing block (still one lane per channel)"
**Goal:** Introduce actual routing semantics.

This is where the earlier `room.html` "connector drag" starts being meaningful.

**Reality check:**
Mixers in CamillaDSP are matrix routers. A mixer isn't a single in/out block.

So the UI must change:
- A mixer node must show **ports** for:
  - each destination channel
  - each source channel

But you requested *one lane per channel*, so we should present mixer editing in a way that still feels lane-based.

**Proposed UX**
- Mixer appears as a node in every lane at the position where it occurs in `pipeline[]`.
- Clicking the mixer opens a "matrix editor" panel:
  - show `mapping[dest]` rows
  - show sources with gain/mute/invert

This is basically what `advanced.js: loadMixers()` already does, but Room EQ can own it.

**Mapping**
- Use existing mixer data structures:
  - `DSP.config.mixers[mixerName].mapping[dest].sources[]`

**Deliverables**
- Mixer can be edited from Room EQ, but not via connector dragging yet.

---

### MVP 5 — "Pipeline stage insertion / processor support + 'Room Correction Block' concept"
**Goal:** Enable real "room correction workflows" and more complex chains.

**Features**
- Support non-biquad filters like `Conv`, `Delay`, `Limiter` (already supported in `filter.js`).
- Allow a "Room Correction Block" group node:
  - visually collapses multiple nodes into one block per lane
  - expands on click
  - internally maps to multiple filter names in order

**Optional future: measurement integration**
- Provide a UI to import REW filters as a block
- Generate target curve filters

**Deliverables**
- Room EQ becomes the home for room correction workflows.

---

## 5) Architectural recommendations (how to structure the code)

### Split code out of HTML
Right now `room.html` is mostly inline JS.
For maintainability and to align with other pages (`advanced.js`, `equalizer.js`, etc.), create:
- `public/src/room.js`

`room.html` becomes:
```html
<script type="module">
  import { roomOnLoad } from '/src/room.js'
  document.addEventListener('DOMContentLoaded', roomOnLoad)
</script>
```

### Reuse existing primitives
- Use `DSP.linearizeConfig()` as the source-of-truth view model.
- Use `filter.js` for editing filter parameters.
- Use `savedConfigs.js` persistence later if you want Room-specific saved presets.

### Rendering strategy
Prefer deterministic lane layout over freeform.
- In MVP 1–3, compute node x-position by index in lane.
- Later, you can store user layout in a separate state if desired (but not necessary for functional editing).

### Wire rendering
Current `.line` div approach works but is finicky with scrolling and offsets.
For MVP 1, I'd recommend:
- use SVG `<line>` elements in an overlay per lane (much easier math)

But since your prototype already uses rotated divs, you can keep that for speed.

---

## 6) How to extend `linearizeConfig()` (optional but useful)

Right now `linearizeConfig()` loses some identity:
- it emits mixer "instances" as `{"type":"mixer","sources":...}` without mixer name.
- it emits filter objects but the filter name is embedded as dynamic key.

If we want Room EQ to be robust, consider adding a new function instead of changing the existing one (to avoid breaking Advanced):

### Proposed new helper
`DSP.linearizeConfigWithRefs()`
Returns the same structure but with richer metadata:
```js
{ type:'mixer', name:'recombine', dest:0, sources:[...] }
{ type:'filter', name:'Filter_123', def:{...} }
```

This makes it much easier to map a clicked node back to config.

---

## 7) Risks and mitigations

### Risk: mismatch between "node wires" and CamillaDSP semantics
Mitigation:
- MVP 1–3 treat lanes as linear chains; wires are decorative.
- Real routing editing is deferred to MVP 4+.

### Risk: dual-channel naming (`__c0` suffix) and filter identity
Mitigation:
- In Room EQ, operate on exact per-channel filter names.
- Provide later a "link channels" option that applies edits to both channels using base-name matching.

### Risk: maintaining validity of config
Mitigation:
- Always call `DSP.validateConfig()` (already exists) before upload.
- Keep pipeline structure stable in early MVPs.

---

## 8) Acceptance criteria per MVP

- **MVP 1:** Room page reliably renders lanes that match `advanced.js` pipeline output, with input/mixer/filter/output nodes visible for every channel.
- **MVP 2:** Can add/edit/delete filters from the Room page and changes reflect in Equalizer/Advanced pages after upload.
- **MVP 3:** Drag reorder within lane persists and reflects in DSP config order.
- **MVP 4:** Mixer matrix can be edited from Room page and affects routing.
- **MVP 5:** Supports non-biquad room correction blocks and sets stage for measurement import/generation.

---

## 9) Implementation priorities

### Recommended order
1. MVP 1 (visualizer) — provides immediate value and validates approach
2. MVP 2 (filter editing) — makes Room EQ functional for its core use case
3. MVP 3 (reordering) — completes the "pipeline editor" experience
4. MVP 4 (mixer editing) — enables routing/crossover workflows
5. MVP 5 (room correction blocks) — adds domain-specific workflows

### Quick wins
- Reusing `linearizeConfig()` means MVP 1 can be done in < 1 day.
- Reusing `filter.js` means MVP 2 filter editing is mostly UI integration.

---

## 10) Future enhancements (post-MVP)

### Measurement integration
- Microphone capture via Web Audio API
- REW export/import for room measurements
- Automated correction filter generation

### Convolution support
- FIR filter upload and visualization
- Convolution block in pipeline

### Advanced routing
- True multi-port mixer nodes with drag-connect
- Visual representation of channel splitting/merging

### Configuration presets
- Save/load room correction profiles
- A/B comparison of correction approaches

---

## 11) Related work

This design builds on:
- Existing `advanced.js` pipeline viewer
- Existing `filter.js` filter parameter editor
- Existing `camillaDSP.js` config management
- Existing `room.html` node/connector DOM prototype

It should not break:
- Dual-channel mode in Equalizer page
- AutoEQ import workflow
- Existing saved configurations

---

## Appendix: Key functions to implement

### MVP 1 functions (in `room.js`)
```js
async function roomOnLoad()
function renderLanes(channels)
function createNode(component, channelNo, index)
function drawWiresBetweenNodes(laneElement)
```

### MVP 2 functions
```js
function openFilterEditor(filterName, channelNo)
function addFilterAfter(channelNo, afterIndex)
function deleteFilter(filterName, channelNo)
```

### MVP 3 functions
```js
function onNodeDragStart(node, event)
function onNodeDrag(node, event)
function onNodeDragEnd(node, event)
function reorderFilter(filterName, channelNo, newIndex)
```

---

## Status

- **Current:** Unfinished prototype in `room.html` with no integration
- **Target (MVP 1):** Read-only multi-lane visualizer
- **Target (MVP 2):** Functional filter editor
- **Target (long-term):** Full room correction workflow with measurement
