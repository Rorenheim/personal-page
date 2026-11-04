# Running the website

This is a static HTML, CSS, and JavaScript website. Keep the existing directory layout; no framework, build step, dependency installation, database, or secrets are required.

Use the **Start application** workflow (the Run button) to serve the website:

```sh
python3 -m http.server 5000 --bind 0.0.0.0
```

Open the web preview to view `index.html`. The other HTML pages are served directly, and local images, videos, scripts, and styles retain their existing relative paths. Refresh the preview after editing files.

This server is for development preview, not a production application server.
