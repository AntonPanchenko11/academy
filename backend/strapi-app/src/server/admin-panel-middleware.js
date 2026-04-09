'use strict';

const fs = require('fs');
const path = require('path');

const STALE_ADMIN_RELOAD_MODULE = "window.location.replace('/admin'); export default {};";

const createAdminPanelMiddleware = ({ strapi }) => {
  const buildDir = path.join(strapi.dirs.app.root, 'build');

  const resolveAdminAssetPath = (requestedPath) => {
    const relFromAdmin = requestedPath.replace(/^\/admin\//, '');
    return path.join(buildDir, relFromAdmin);
  };

  const isHashedAdminChunk = (requestedPath) => {
    const fileName = path.basename(requestedPath || '');
    return /-[A-Za-z0-9_-]{6,}\.js$/.test(fileName);
  };

  const sendAdminReloadModule = (ctx) => {
    ctx.type = 'application/javascript; charset=utf-8';
    ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    ctx.set('Pragma', 'no-cache');
    ctx.set('Expires', '0');

    if (ctx.method === 'HEAD') {
      ctx.status = 200;
      return;
    }

    ctx.body = STALE_ADMIN_RELOAD_MODULE;
  };

  return async (ctx, next) => {
    if ((ctx.method === 'GET' || ctx.method === 'HEAD') && ctx.path.startsWith('/admin/') && ctx.path.endsWith('.js')) {
      const filePath = resolveAdminAssetPath(ctx.path);
      if (fs.existsSync(filePath)) {
        ctx.type = 'application/javascript; charset=utf-8';
        if (ctx.method === 'HEAD') {
          ctx.status = 200;
          return;
        }
        ctx.body = fs.createReadStream(filePath);
        return;
      }

      if (ctx.path.startsWith('/admin/node_modules/.strapi/vite/deps/') || isHashedAdminChunk(ctx.path)) {
        sendAdminReloadModule(ctx);
        return;
      }
    }

    await next();

    if (ctx.method === 'GET' && ctx.path.startsWith('/admin') && String(ctx.response.type || '').includes('text/html')) {
      ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      ctx.set('Pragma', 'no-cache');
      ctx.set('Expires', '0');
    }
  };
};

module.exports = {
  createAdminPanelMiddleware,
};
