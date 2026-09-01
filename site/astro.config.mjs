import { defineConfig } from "astro/config";
import { getDeploymentConfig } from "./src/config/deployment.js";

const domain = process.env.DOMAIN?.trim();
const deployment = getDeploymentConfig();

export default defineConfig({
  ...(domain
    ? { site: domain.includes("://") ? domain : `https://${domain}` }
    : {}),
  base: deployment.basePath,
  output: "static",
});
