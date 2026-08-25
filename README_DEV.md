# Repository Maintenance

Last Updated: 2026-08-25

This repository is the source of truth for the public GitHub profile and the public personal site.

## Structure

- `README.md`: public GitHub profile README. Keep it short and reader-facing.
- `profile/`: public profile materials rendered by the personal site.
- `essays/`: source Markdown for public, sanitized essays.
- `site/`: Astro static site that renders `essays/` into readable pages.
- `.github/workflows/deploy.yml`: GitHub Pages deployment workflow.

## Essay Workflow

1. Add or edit Markdown under `essays/YYYYMM/`.
2. Use readable file names, preferably English slugs such as `agent-workflow-single-multi.md`.
3. Add front matter for new essays:

```yaml
---
title: Article title
subtitle: Optional subtitle
last_updated: YYYY-MM-DD
---
```

4. Update `essays/README.md` so the Markdown index stays useful.
5. Commit and push to `main`.

Historical essays may rely on compatibility heuristics in the site renderer, but new essays should use front matter.

## Local Development

Run the site from the Astro project directory:

```bash
cd site
npm install
npm run dev -- --port 4321
```

The local site is served at:

```text
http://127.0.0.1:4321/
```

Before pushing site changes, run:

```bash
cd site
npm run build
```

## Rendering Model

Astro builds a static site. During build:

- `site/src/lib/content.js` reads source essays from the root `essays/` directory.
- `site/src/lib/content.js` reads the public About Me source from `profile/about-me.md`.
- `site/src/pages/index.astro` generates the homepage.
- `site/src/pages/about.astro` generates the public About Me page.
- `site/src/pages/read/[month]/[slug].astro` generates one reader page per essay.
- `site/scripts/sync-public-essays.mjs` copies `essays/` into `site/public/source/` so raw Markdown files are available online.

The generated site is static and can be hosted by GitHub Pages.

## Deployment

Pushing to `main` triggers GitHub Actions and deploys the site to:

```text
https://lin-guanguo.github.io/Lin-Guanguo/
```

Deployments use the domain root by default. GitHub Actions automatically derives the GitHub Pages base path from `GITHUB_REPOSITORY`, so the repository can also deploy unchanged to root-hosted platforms such as EdgeOne Pages.

Two optional environment variables are available when a deployment needs explicit URL settings:

- `DOMAIN`: canonical domain used by Astro for SEO-oriented absolute URLs. The `https://` scheme is added when omitted.
- `BASE_PATH`: path prefix for a platform that serves the site below its domain root.

Neither variable is required for the current GitHub Pages or EdgeOne Pages deployments. See `site/.env.example` for examples.

## Ignore Rules

Do not commit generated or local dependency files:

- `site/node_modules/`
- `site/dist/`
- `site/.astro/`
- `site/public/source/`

These are covered by `.gitignore`.

## Public Data Policy

Only commit content that is already public and sanitized. Personal, private, or unpublished material should stay outside this repository.
