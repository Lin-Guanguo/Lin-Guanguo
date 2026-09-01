export const DeploymentTarget = Object.freeze({
  EDGEONE: "edgeone",
  GITHUB_PAGES: "github-pages",
});

const deployments = Object.freeze({
  [DeploymentTarget.GITHUB_PAGES]: Object.freeze({
    cloudflareAnalyticsToken: "8fb2bd9bf84c4eb2a002497861faf5ea",
  }),
  [DeploymentTarget.EDGEONE]: Object.freeze({
    cloudflareAnalyticsToken: "5c4eadc85c184547a8923cef932b3704",
    icpFiling: Object.freeze({
      number: "闽ICP备2026034120号-1",
      url: "https://beian.miit.gov.cn/",
    }),
  }),
});

function resolveTarget(env) {
  return env.GITHUB_ACTIONS === "true"
    ? DeploymentTarget.GITHUB_PAGES
    : DeploymentTarget.EDGEONE;
}

function resolveBasePath(target, env) {
  const configuredBasePath = env.BASE_PATH?.trim();
  if (configuredBasePath) {
    return configuredBasePath;
  }

  if (target === DeploymentTarget.GITHUB_PAGES) {
    const repositoryName = env.GITHUB_REPOSITORY?.split("/").at(-1);
    return repositoryName ? `/${repositoryName}` : "/";
  }

  return "/";
}

export function getDeploymentConfig(env = process.env) {
  const target = resolveTarget(env);

  return {
    target,
    basePath: resolveBasePath(target, env),
    ...deployments[target],
  };
}
