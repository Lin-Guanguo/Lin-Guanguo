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

- `DOMAIN`: site origin used by Astro for absolute sitemap URLs. The `https://` scheme is added when omitted. Defaults to `https://lin-guanguo.github.io` in GitHub Actions and `https://me.linguanguo.top` elsewhere. Set any path prefix separately with `BASE_PATH`.
- `BASE_PATH`: path prefix for a platform that serves the site below its domain root.

Neither variable is required for the current GitHub Pages or EdgeOne Pages deployments. See `site/.env.example` for examples.

### Article routing

Article links, including sitemap entries, use `/read/YYYYMM/slug/index.html` so they resolve to an actual build output file without relying on a host's directory-index behavior.

After deploying link changes, check article URLs on the production custom domain. Successful navigation in a local Astro preview or an EdgeOne deployment preview does not verify routing on the custom domain.

### Sitemap and crawler access

`@astrojs/sitemap` generates `sitemap-index.xml` and numbered sitemap files from the built HTML pages, including new essays automatically. URLs include the deployment origin and base path. Raw Markdown downloads and assets are not listed. Every page links to the sitemap in its HTML head; this adds no visible text.

The generated `robots.txt` allows crawling and advertises the absolute sitemap URL. It does not guarantee indexing or override hosting-level bot protection. Check CDN access rules and real crawler logs separately if requests are blocked.

- On EdgeOne, deploy at the domain root so `/robots.txt` is effective. The sitemap is `https://me.linguanguo.top/sitemap-index.xml`.
- GitHub Pages publishes this project below `/Lin-Guanguo/`. Crawlers ignore `/Lin-Guanguo/robots.txt`; they only read `https://lin-guanguo.github.io/robots.txt`. Root-level rules must be managed by that host's root site, outside this repository. The project sitemap remains usable at `https://lin-guanguo.github.io/Lin-Guanguo/sitemap-index.xml` and can be submitted in Google Search Console or Bing Webmaster Tools after deployment.

Validate both deployment variants before publishing:

```bash
cd site
npm test
npm run build
GITHUB_ACTIONS=true GITHUB_REPOSITORY=Lin-Guanguo/Lin-Guanguo npm run build
```

Inspect `dist/robots.txt` and `dist/sitemap-*.xml` after each build. Sitemap entries should match the built HTML pages and use the expected host and base path. Do not add build-time `lastmod` values unless the corresponding content actually changed.

### AI-readable site guide

`src/pages/llms.txt.js` generates an AI-readable guide with a short introduction, resume links, and Markdown links for all essays. The essay list updates automatically at build time. `src/pages/about/index.md.js` publishes the existing `profile/about-me.md` unchanged at `/about/index.md`; its relative links retain the same base as the HTML resume.

Every HTML page advertises the guide through a `rel="describedby"` link in its head, without adding visible content. The guide is published at `/llms.txt` on the custom domain and `/Lin-Guanguo/llms.txt` on GitHub Pages. Unlike robots.txt, the [llms.txt proposal](https://llmstxt.org/) supports subpath placement. It provides content guidance, not access control or a ranking guarantee; robots.txt continues to allow all crawlers.

## Ignore Rules

Do not commit generated or local dependency files:

- `site/node_modules/`
- `site/dist/`
- `site/.astro/`
- `site/public/source/`

These are covered by `.gitignore`.

## Public Data Policy

Only commit content that is already public and sanitized. Personal, private, or unpublished material should stay outside this repository.
