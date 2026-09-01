import assert from "node:assert/strict";
import test from "node:test";
import { DeploymentTarget, getDeploymentConfig } from "./deployment.js";

test("configures GitHub Pages from its built-in environment", () => {
  const deployment = getDeploymentConfig({
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "Lin-Guanguo/Lin-Guanguo",
  });

  assert.equal(deployment.target, DeploymentTarget.GITHUB_PAGES);
  assert.equal(deployment.basePath, "/Lin-Guanguo");
  assert.equal(
    deployment.cloudflareAnalyticsToken,
    "8fb2bd9bf84c4eb2a002497861faf5ea",
  );
  assert.equal(deployment.icpFiling, undefined);
});

test("configures EdgeOne for builds outside GitHub Actions", () => {
  const deployment = getDeploymentConfig({});

  assert.equal(deployment.target, DeploymentTarget.EDGEONE);
  assert.equal(deployment.basePath, "/");
  assert.equal(
    deployment.cloudflareAnalyticsToken,
    "5c4eadc85c184547a8923cef932b3704",
  );
  assert.deepEqual(deployment.icpFiling, {
    number: "闽ICP备2026034120号-1",
    url: "https://beian.miit.gov.cn/",
  });
});

test("keeps the existing base path override", () => {
  const deployment = getDeploymentConfig({ BASE_PATH: "/preview" });

  assert.equal(deployment.basePath, "/preview");
});
