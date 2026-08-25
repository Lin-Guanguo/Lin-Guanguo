import { defineConfig } from "astro/config";

const domain = process.env.DOMAIN?.trim();
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").at(-1);
const defaultBase =
  process.env.GITHUB_ACTIONS === "true" && repositoryName
    ? `/${repositoryName}`
    : "/";

export default defineConfig({
  ...(domain
    ? { site: domain.includes("://") ? domain : `https://${domain}` }
    : {}),
  base: process.env.BASE_PATH?.trim() || defaultBase,
  output: "static",
});
