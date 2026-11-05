# Running the website

This is a static HTML, CSS, and JavaScript website. Keep the existing source directory layout; no framework, dependency installation, database, or secrets are required.

Use the **Start application** workflow (the Run button) to serve the website:

```sh
python3 -m http.server 5000 --bind 0.0.0.0
```

Open the web preview to view `index.html`. The other HTML pages are served directly, and local images, videos, scripts, and styles retain their existing relative paths. Refresh the preview after editing files.

This server is for development preview, not a production application server.

## Production CDN

Publish as a **Static Deployment**, not a Python server. Replit's static hosting
provides global CDN delivery for the website and its media on the same origin.
The development preview is not the production CDN.

Publishing runs:

```sh
python3 scripts/build_static.py
```

The public directory is `generated-artifacts/site`. The build copies the website
and gives media content-hashed filenames, rewriting references in the generated
HTML and JavaScript, including the homepage shader's video. Sources are unchanged.
Only website code and media are included; the imported ZIP, documentation, and
unreferenced root-level source media are not published.

Production response headers in `.replit` make generated media cacheable for one
year (`immutable`). HTML, CSS, JavaScript, and vendor scripts revalidate to avoid
serving stale references after updates. Changed media gets a new URL automatically.
Never apply immutable caching to the original, unversioned media filenames.

Run the build after changing sources and publish again to update the CDN.
Actual CDN headers and video range behavior must be checked against the published
URL after the first publish; the Python preview does not implement those headers.

## Prebaked animation media

Tile illustrations use offline-rendered clips, except the pointer-driven Blog
illustration and interactive Play game. The Projects tile uses a small native
video with screen blending; the other animated tiles use transparent WebP clips.
Touch devices retain still tiles without scroll-triggered animation.

Subpage backgrounds use native muted looping videos with portrait and landscape
variants and still posters for reduced motion. The index background is unchanged.
Explicit media URLs in `js/prebaked-media.js` are fingerprinted by the CDN build.

To regenerate, run `node scripts/bake-animations.mjs` with Node 22+, Chromium and
ffmpeg available while the preview server is running. Original procedural sources
are retained in `scripts/animation-sources/` for offline rendering only. Temporary
frames go in the ignored `generated-artifacts/animation-bake/` directory.
Do not use `--snapshot` again; it is only for capturing the original sources once.
