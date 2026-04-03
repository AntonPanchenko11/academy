const HIDDEN_ROUTE_PATHS = new Set(["list-plugins", "plugins/cloud"]);
const HIDDEN_SETTINGS_LINK_IDS = new Set(["plugins"]);
const HIDDEN_SETTINGS_LINK_TARGETS = new Set(["list-plugins", "plugins/cloud"]);

const normalizePath = (value) =>
  String(value || "")
    .replace(/^\/+/, "")
    .replace(/\/\*$/, "");

const matchesHiddenPath = (value) => HIDDEN_ROUTE_PATHS.has(normalizePath(value));

const shouldHideMenuLink = (link) => {
  const target = String(link?.to || "");

  return target.includes("market.strapi.io") || matchesHiddenPath(target);
};

const shouldHideSettingsLink = (link) => {
  return (
    HIDDEN_SETTINGS_LINK_IDS.has(link?.id) ||
    HIDDEN_SETTINGS_LINK_TARGETS.has(normalizePath(link?.to))
  );
};

const pruneArrayInPlace = (items, predicate) => {
  if (!Array.isArray(items)) {
    return;
  }

  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      items.splice(index, 1);
    }
  }
};

const pruneRoutes = (routes = []) =>
  routes
    .filter((route) => !matchesHiddenPath(route?.path))
    .map((route) => {
      if (!Array.isArray(route?.children)) {
        return route;
      }

      return {
        ...route,
        children: pruneRoutes(route.children),
      };
    });

const injectHiddenUiStyles = () => {
  if (document.getElementById("academy-admin-hidden-ui")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "academy-admin-hidden-ui";
  style.textContent = `
    a[href="https://market.strapi.io"],
    a[href^="https://market.strapi.io/"],
    a[href$="/settings/list-plugins"],
    a[href*="/settings/list-plugins?"],
    a[href$="/plugins/cloud"],
    a[href*="/plugins/cloud/"] {
      display: none !important;
    }
  `;

  document.head.appendChild(style);
};

const config = {};

const register = (app) => {
  pruneArrayInPlace(app.router.menu, shouldHideMenuLink);

  Object.values(app.router.settings || {}).forEach((section) => {
    pruneArrayInPlace(section.links, shouldHideSettingsLink);
  });

  app.router.addRoute((routes) => pruneRoutes(routes));
};

const bootstrap = () => {
  injectHiddenUiStyles();
};

export default {
  config,
  register,
  bootstrap,
};
