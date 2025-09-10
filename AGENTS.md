# Repository Guidelines

## Project Structure & Module Organization
- `config.toml` – Zola site configuration (title, base_url, taxonomies).
- `content/` – Markdown pages and sections (e.g., `content/master/*.md`).
- `templates/` – Tera templates and macros (e.g., `templates/master-*.html`, `templates/macros/`).
- `static/` – Static assets copied verbatim to the build (e.g., `static/images/Me.jpg`).
- `public/` – Build output. Do not edit by hand; changes are overwritten by `zola build`.
- `deploy.sh` – Helper script for building/publishing the site.

## Build, Test, and Development Commands
- `zola serve` – Run local dev server with live reload at `http://127.0.0.1:1111`.
- `zola build` – Generate the site into `public/`.
- `zola check` – Validate internal/external links and references.
- `python3 tools/tb_export.py --logdir <tb_logdir> --outdir public/master-data` – Export TensorBoard runs into the dashboard data format.
- `TB_LOGDIR=<tb_logdir> ./deploy.sh` – Build, optionally export TB runs, and deploy.

## Coding Style & Naming Conventions
- Indentation: 2 spaces for HTML/Tera, CSS, and JS.
- Filenames and slugs: kebab-case (e.g., `master-plan.md`, `master-results.html`).
- Tera: keep logic minimal; extract reusable pieces to `templates/macros/`.
- CSS: place custom styles in `static/` and include via templates; avoid editing generated files in `public/`.

## Testing Guidelines
- Preview with `zola serve`; verify pages render and console is clean.
- Run `zola check` before PRs; fix broken links, missing assets, or warnings.
- For visual changes, include before/after screenshots (desktop and mobile).

## Commit & Pull Request Guidelines
- Commit messages: imperative mood with optional scope.
  - Example: `templates: adjust menu macro spacing`
- PRs: clear description, linked issues, screenshots for UI changes, and brief test notes.
- Keep PRs small and focused; do not mix content updates, template refactors, and styling in one PR unless necessary.

## Security & Configuration Tips
- Set `base_url` in `config.toml` per environment.
- Do not commit secrets; keep credentials out of templates and content.
- Add new datasets/assets under `static/`; never edit generated files in `public/`.
- Verify `public/master-data/manifest.json` is served after exporting TB runs.

## TensorBoard Data Workflow
- Source: TensorBoard event logs under a run directory tree (e.g., `~/runs/<experiment>/events.out.tfevents.*`).
- Export: `python3 tools/tb_export.py --logdir ~/runs --outdir public/master-data`.
  - Produces per-run folders with `meta.json`, `scalars.json`, and `loss.csv`/`mse.csv`.
  - Heuristically picks tags (`loss`, `mse`, `accuracy`); override with `--loss-tags`, `--mse-tags`, `--acc-tags`.
- View: `zola serve` → `/master/results/` (use `?debug` to see detailed logs and URLs).
