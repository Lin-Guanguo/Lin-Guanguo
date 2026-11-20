import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { getDeploymentConfig } from "./src/config/deployment.js";

const domain = process.env.DOMAIN?.trim();
const deployment = getDeploymentConfig();

export default defineConfig({
  site: domain
    ? domain.includes("://")
      ? domain
      : `https://${domain}`
    : deployment.siteUrl,
  base: deployment.basePath,
  integrations: [
    sitemap({
      serialize: (item) => ({
        ...item,
        url: item.url.replace(/(\/read\/\d{6}\/[^/]+)\/?$/, "$1/index.html"),
      }),
    }),
  ],
  output: "static",
});
