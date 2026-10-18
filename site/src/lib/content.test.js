import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as content from "./content.js";

test("reads the public about page from the profile source", () => {
  assert.equal(typeof content.getAboutPage, "function");

  const about = content.getAboutPage();

  assert.equal(about.title, "林观果");
  assert.equal(about.lastUpdated, "2026-10-17");
  assert.match(about.summary[0], /^我是一名/);
  assert.match(about.summary.at(-1), /如何让边界重新变得清晰/);
  assert.doesNotMatch(about.summary.join("\n"), /负责 C 端创作生图 APP/);
  assert.match(about.html, /Agent Runtime \/ AI 系统工程师/);
  assert.match(about.html, /Plan-and-Execute 与 ReAct/);
  assert.match(about.html, /技术关注/);
  assert.match(about.html, /href="\.\.\/"/);
  assert.doesNotMatch(about.html, /lin-guanguo\.github\.io/);
});

test("homepage does not include the old English intro sentence", () => {
  const homepage = fs.readFileSync("src/pages/index.astro", "utf8");

  assert.doesNotMatch(homepage, /I build production-grade AI Agent systems/);
});

test("article images resolve to published assets on both deployment paths", () => {
  const originalBasePath = process.env.BASE_PATH;

  try {
    for (const basePath of ["/", "/Lin-Guanguo/"]) {
      process.env.BASE_PATH = basePath;
      const article = content.getArticles().find(
        (entry) => entry.slug === "ai-life-personal-records",
      );
      const imageSources = [...article.html.matchAll(/<img[^>]+src="([^"]+)"/g)]
        .map((match) => match[1]);

      assert.equal(imageSources.length, 3);
      for (const source of imageSources) {
        assert.ok(source.startsWith(`${basePath}source/202610/assets/`));
        const relativeSource = source.slice(`${basePath}source/`.length);
        assert.ok(fs.existsSync(`../essays/${relativeSource}`));
      }
    }
  } finally {
    if (originalBasePath === undefined) {
      delete process.env.BASE_PATH;
    } else {
      process.env.BASE_PATH = originalBasePath;
    }
  }
});
