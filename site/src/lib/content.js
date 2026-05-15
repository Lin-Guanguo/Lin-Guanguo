import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

const repoRoot = path.resolve(process.cwd(), "..");
const essaysRoot = path.join(repoRoot, "essays");

marked.use({
  gfm: true,
  breaks: false,
});

const monthFormatter = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function monthLabel(month) {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(4, 6)) - 1;
  return monthFormatter.format(new Date(Date.UTC(year, monthIndex, 1)));
}

export function getArticles() {
  return fs
    .readdirSync(essaysRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{6}$/.test(entry.name))
    .flatMap((entry) => {
      const month = entry.name;
      const monthDir = path.join(essaysRoot, month);

      return fs
        .readdirSync(monthDir, { withFileTypes: true })
        .filter((file) => file.isFile() && file.name.endsWith(".md"))
        .map((file) => readArticle(month, file.name));
    })
    .sort((a, b) => {
      if (a.month !== b.month) return b.month.localeCompare(a.month);
      if (a.lastUpdated !== b.lastUpdated) {
        return b.lastUpdated.localeCompare(a.lastUpdated);
      }
      return a.title.localeCompare(b.title, "zh-Hans-CN");
    });
}

export function groupArticlesByMonth(articles) {
  const groups = new Map();

  for (const article of articles) {
    if (!groups.has(article.month)) {
      groups.set(article.month, {
        month: article.month,
        label: article.monthLabel,
        articles: [],
      });
    }
    groups.get(article.month).articles.push(article);
  }

  return Array.from(groups.values());
}

function readArticle(month, filename) {
  const slug = filename.replace(/\.md$/, "");
  const absolutePath = path.join(essaysRoot, month, filename);

  if (!fs.existsSync(absolutePath)) return null;

  const raw = fs.readFileSync(absolutePath, "utf8");
  const parsed = matter(raw);
  const body = normalizeBody(parsed.content);
  const title = plainText(
    parsed.data.title || firstHeading(parsed.content) || titleFromSlug(slug),
  );
  const subtitle = plainText(parsed.data.subtitle || firstSubtitle(parsed.content));
  const lastUpdated = parsed.data.last_updated || extractLastUpdated(raw);

  return {
    slug,
    title,
    subtitle,
    lastUpdated,
    month,
    monthLabel: monthLabel(month),
    sourcePath: `/source/${month}/${filename}`,
    html: marked.parse(body),
  };
}

function firstHeading(content) {
  return content.match(/^#\s+(.+)$/m)?.[1];
}

function firstSubtitle(content) {
  const lines = initialContentLines(content);
  const firstLine = lines[0] || "";

  if (firstLine.startsWith("## ")) {
    return firstLine.replace(/^##\s+/, "");
  }

  const italic = firstLine.match(/^\*+(.+?)\*+$/);
  return italic?.[1]?.replace(/^——\s*/, "");
}

function extractLastUpdated(raw) {
  return raw.match(/^Last Updated:\s*(\d{4}-\d{2}-\d{2})/m)?.[1] || "";
}

function normalizeBody(content) {
  const lines = initialContentLines(content);
  const firstLine = lines[0] || "";

  if (firstLine.startsWith("## ") || /^\*+(.+?)\*+$/.test(firstLine)) {
    lines.shift();
  }

  while (lines[0] === "---") {
    lines.shift();
  }

  return lines.join("\n").trim();
}

function initialContentLines(content) {
  const lines = content.trim().split("\n");

  while (lines.length > 0) {
    const line = lines[0].trim();
    if (
      line === "" ||
      line === "---" ||
      line.startsWith("Last Updated:") ||
      line.startsWith("小红书发布:") ||
      line.startsWith("图片标题:") ||
      line.startsWith("文字标题:")
    ) {
      lines.shift();
      continue;
    }
    break;
  }

  if (lines[0]?.startsWith("# ")) {
    lines.shift();
  }

  while (lines[0]?.trim() === "") {
    lines.shift();
  }

  return lines;
}

function plainText(value = "") {
  return String(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromSlug(slug) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
