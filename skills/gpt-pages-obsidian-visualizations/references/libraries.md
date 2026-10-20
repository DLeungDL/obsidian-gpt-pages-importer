# Plotly.js and MathBox

## Choose for the subject

| Content | Default |
| --- | --- |
| Functions, statistics, contours, data exploration, ordinary 3D surfaces | Plotly.js |
| Vector relationships, coordinate transforms, mathematical geometry and concept animations | MathBox with compatible Three.js |
| Simple relationships or a requested offline lightweight visual | Native Mermaid or self-contained SVG/Canvas as appropriate |

Do not load both libraries for every figure or rewrite existing working visuals. Chart formulas, source data, sampling rules and controls remain in canonical HTML; CDN packages supply the rendering engine. The footer must contain the same complete HTML used by Pages, including the dependency URLs and load/error handling. Keep v3 pairing and HTML-source trust behavior unchanged.

## Fixed dependency baseline

These versions were used in a controlled Pages runtime diagnostic. They are reproducible starting points, not permanent latest-version requirements or proof across all viewers/devices.

| Dependency | Pinned URL |
| --- | --- |
| Plotly.js 3.1.0 | `https://cdn.jsdelivr.net/npm/plotly.js-dist-min@3.1.0/plotly.min.js` |
| Three.js 0.137.0 | `https://cdn.jsdelivr.net/npm/three@0.137.0/build/three.min.js` |
| Matching OrbitControls | `https://cdn.jsdelivr.net/npm/three@0.137.0/examples/js/controls/OrbitControls.js` |
| MathBox 2.3.1 | `https://cdn.jsdelivr.net/npm/mathbox@2.3.1/build/bundle/mathbox.min.js` |
| MathBox stylesheet (authoring source; embed in HTML) | `https://cdn.jsdelivr.net/npm/mathbox@2.3.1/build/mathbox.css` |

Use Plotly alone for Plotly figures. For MathBox, load Three.js, matching OrbitControls and MathBox in that order, then initialize with the matching CSS already embedded. A future upgrade must verify API compatibility, CSS, rendering and interactions together. Never substitute `@latest`, a semver range or an unversioned alias. MathBox is built on Three.js and ShaderGraph, so its dependency set must be considered together.

## MathBox loading contract

- Copy the complete matching `build/mathbox.css` into a `<style>` element in the canonical HTML. The bundled template includes MathBox 2.3.1 CSS and its MIT notice; preserve both when adapting it. Do not replace this with a runtime `<link>` or a few approximate rules. Inspect CSS for `@import` and `url(...)`; embed or explicitly account for any resources introduced by an upgrade.
- External MathBox CSS failed to load from both CDNs in a user-reported Obsidian test, even though the preceding JavaScript loads completed. The precise network or renderer cause is unresolved. Embedding the stylesheet removes that failure point; it does not establish that all networks or WebGL environments work.
- For each JavaScript file above, use its pinned jsDelivr URL first and `https://unpkg.com/` followed by the identical package/version/path as backup. Keep both complete URLs explicit in the source so the export helper can inventory them. Do not switch versions or mix dependency sets during fallback.
- Await each dependency and validate its required global/API before loading the next. On error, timeout or a missing API, try the backup once. Remove failed elements, clear timers and handlers, and ignore late callbacks. After both attempts fail, keep controls disabled and display the library name, attempted URLs and failure types. Bound each attempt (the template uses 12 seconds); do not retry indefinitely.
- Keep the embedded CSS, loader and exact dependency URLs identical in the native visualization and footer HTML. Any source change requires replacing the native visualization and regenerating the v3 reference/checksum, including the payload's final newline. Do not weaken renderer sandbox permissions to fix network loading.
- JavaScript still needs network access. CSS embedding and CDN fallback do not make the chart offline or guarantee remote-library integrity.

The [Plotly function template](../assets/plotly-function.html) plots `y = a x²` with an amplitude slider and reset. The [MathBox template](../assets/mathbox-curve.html) samples `y = a sin(2x)` with the same controls. They use fixed CDN URLs, finite load timeouts and visible errors. Their static/mock tests are not real browser or WebGL evidence. The prior diagnostic used a different HTML artifact.

## CDN-backed default

CDN use is allowed without an additional permission prompt under this workflow. Respect any user restriction to offline operation. Include a concise network requirement in Page prose outside the visual. Use system fonts and explicit local styles unless another dependency is needed and declared. Preserve all user-requested content.

Await libraries before calling their APIs. Detect missing globals and WebGL initialization failure, show loading/failure text, and leave controls disabled until initialization succeeds. Core chart behavior must run without Pages-only APIs or same-origin storage; optional `window.openai` state integration needs an in-memory fallback. A renderer's sandbox does not inherit library globals from an Obsidian plugin.

Keep the loader and exact URLs in the canonical HTML submitted to Pages and in the matching v3 footer. HTML SHA-256 protects the HTML bytes, not the content delivered by the CDN. Source preservation does not prove network availability, a successful library fetch or actual rendering. Record each evidence layer separately using [validation.md](validation.md).

## Offline requests and size limits

Only when offline use is requested, choose an appropriate self-contained SVG/Canvas implementation or a measured bundle that fits the current Pages tool budget. Pages visualization HTML currently has a 256 KiB UTF-8 upload limit. Large complete libraries may not fit. Do not silently remove libraries, claim a CDN source is self-contained, change sandbox permissions or install a local runtime. Report the actual limit and proposed alternative if the requested engine cannot fit.

The verifier's `--require-self-contained` rejects detected dependencies without fetching or executing them. Its scan cannot establish that all computed loads are absent. Even an inline bundle needs real renderer testing. Existing importer image-asset support does not install JavaScript libraries or provide offline library resolution.

## Primary references

- [Plotly surface examples](https://plotly.com/javascript/3d-surface-plots/) and [bundle choices/sizes](https://github.com/plotly/plotly.js/blob/main/dist/README.md).
- [MathBox documentation and dependency setup](https://github.com/unconed/mathbox).
- [Three.js documentation](https://threejs.org/docs/).
