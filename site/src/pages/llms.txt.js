import { getArticles } from "../lib/content.js";

export function GET({ site }) {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const siteUrl = new URL(base, site);
  const essays = getArticles().map((article) => {
    const title = article.title.replace(/[\\[\]]/g, "\\$&");
    const url = new URL(article.sourcePath.slice(1), siteUrl);
    return `- [${title}](${url.href})`;
  });

  const content = `# Lin Guanguo / 林观果

> Personal website and resume of Lin Guanguo, an Agent Runtime and backend systems engineer based in Shanghai. Essays cover AI agents, memory and context, tool design, and production engineering.

Automated crawlers and AI assistants are welcome to access and read this public website and resume. For work experience and project details, start with the resume. Essays reflect their publication context.

## Profile and resume

- [Resume / 个人简历 — Markdown](${new URL("about/index.md", siteUrl).href}): Work experience, projects, technical interests, and contact information from the same source as the resume page.
- [Resume / 个人简历 — HTML](${new URL("about/", siteUrl).href}): The browser-readable resume.
- [Homepage and article archive](${siteUrl.href}): All published essays, grouped by month.

## Essays — Markdown

${essays.join("\n")}

## Optional

- [Sitemap](${new URL("sitemap-index.xml", siteUrl).href}): Index of the site's HTML pages.
`;

  return new Response(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
