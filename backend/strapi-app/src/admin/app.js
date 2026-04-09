const HIDDEN_ROUTE_PATHS = new Set(["list-plugins", "plugins/cloud"]);
const HIDDEN_SETTINGS_LINK_IDS = new Set(["plugins"]);
const HIDDEN_SETTINGS_LINK_TARGETS = new Set(["list-plugins", "plugins/cloud"]);
const LOCKED_CONTENT_MANAGER_MODELS = new Set([]);
const LOCKED_CONTENT_MANAGER_ACTION_TYPES = new Set([
  "edit",
  "update",
  "publish",
  "unpublish",
  "discard",
]);

const normalizePath = (value) =>
  String(value || "")
    .replace(/^\/+/, "")
    .replace(/\/\*$/, "");

const decodeUriComponentSafe = (value) => {
  try {
    return decodeURIComponent(String(value || ""));
  } catch (error) {
    return String(value || "");
  }
};

const buildLockedContentManagerListPath = (model) =>
  `/admin/content-manager/collection-types/${encodeURIComponent(model)}`;

const resolveUrl = (value) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(String(value), window.location.href);
  } catch (error) {
    return null;
  }
};

const getLockedContentManagerRouteInfo = (value) => {
  const url = resolveUrl(value);
  if (!url) {
    return null;
  }

  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeUriComponentSafe(segment));
  const baseIndex = segments[0] === "admin" ? 1 : 0;

  if (
    segments[baseIndex] !== "content-manager" ||
    segments[baseIndex + 1] !== "collection-types"
  ) {
    return null;
  }

  const model = segments[baseIndex + 2];
  if (!LOCKED_CONTENT_MANAGER_MODELS.has(model)) {
    return null;
  }

  const tail = segments.slice(baseIndex + 3);
  const firstTailSegment = tail[0] || "";
  const isCreateRoute = firstTailSegment === "create";
  const isCloneRoute = firstTailSegment === "clone";
  const isConfigRoute = firstTailSegment === "configurations";

  return {
    listPath: buildLockedContentManagerListPath(model),
    isBlocked: tail.length > 0 && !isCreateRoute && !isCloneRoute && !isConfigRoute,
    search: url.search || "",
  };
};

const isLockedExistingDocument = (props) => {
  const model = String(props?.model || "");
  const documentId = String(props?.documentId || "");

  return LOCKED_CONTENT_MANAGER_MODELS.has(model) && documentId && documentId !== "create";
};

const wrapLockedContentManagerAction = (Action) => {
  if (!LOCKED_CONTENT_MANAGER_ACTION_TYPES.has(Action?.type)) {
    return Action;
  }

  const WrappedAction = (props) => {
    if (isLockedExistingDocument(props)) {
      return null;
    }

    return Action(props);
  };

  WrappedAction.displayName = `Locked${Action.displayName || Action.name || "Action"}`;
  WrappedAction.position = Action.position;
  WrappedAction.type = Action.type;

  return WrappedAction;
};

const patchLockedContentManagerNavigation = () => {
  if (window.__academyLockedContentManagerNavigationPatched) {
    return;
  }

  const patchMethod = (methodName) => {
    const original = window.history[methodName].bind(window.history);

    window.history[methodName] = (state, title, url) => {
      const routeInfo = getLockedContentManagerRouteInfo(url);

      if (routeInfo?.isBlocked) {
        return original(state, title, `${routeInfo.listPath}${routeInfo.search}`);
      }

      return original(state, title, url);
    };
  };

  patchMethod("pushState");
  patchMethod("replaceState");

  const redirectCurrentRoute = () => {
    const routeInfo = getLockedContentManagerRouteInfo(window.location.href);

    if (routeInfo?.isBlocked) {
      window.location.replace(`${routeInfo.listPath}${routeInfo.search}`);
    }
  };

  window.addEventListener("popstate", redirectCurrentRoute);
  redirectCurrentRoute();
  window.__academyLockedContentManagerNavigationPatched = true;
};

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

  const contentManagerPlugin = app.getPlugin("content-manager");
  if (contentManagerPlugin?.apis?.addDocumentAction) {
    contentManagerPlugin.apis.addDocumentAction((actions) =>
      actions.map((action) => wrapLockedContentManagerAction(action))
    );
  }
};

const bootstrap = () => {
  injectHiddenUiStyles();
  patchLockedContentManagerNavigation();
};

export default {
  config,
  register,
  bootstrap,
};
