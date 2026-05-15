import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as content from "./content.js";

test("reads the public about page from the profile source", () => {
  assert.equal(typeof content.getAboutPage, "function");

  const about = content.getAboutPage();

  assert.equal(about.title, "林观果");
  assert.equal(about.lastUpdated, "2026-05-15");
  assert.equal(about.summary.length, 4);
  assert.match(about.summary[0], /^我是一名/);
  assert.match(about.summary[3], /构建稳定复杂系统的能力仍然稀缺/);
  assert.match(about.html, /AI Agent \/ 后端系统工程师/);
  assert.match(about.html, /技术底色/);
});

test("homepage does not include the old English intro sentence", () => {
  const homepage = fs.readFileSync("src/pages/index.astro", "utf8");

  assert.doesNotMatch(homepage, /I build production-grade AI Agent systems/);
});
