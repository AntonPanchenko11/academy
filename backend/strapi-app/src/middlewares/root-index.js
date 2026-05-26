'use strict';

const fs = require('fs');
const path = require('path');

module.exports = (_config, { strapi }) => {
  const indexPath = path.join(strapi.dirs.static.public, 'index.html');
  const timetablePath = '/timetable';
  const serviceRoutes = [
    '/admin',
    '/api',
    '/assets',
    '/content-manager',
    '/content-type-builder',
    '/email',
    '/i18n',
    '/releases',
    '/review-workflows',
    '/upload',
    '/uploads',
    '/users-permissions',
  ];
  const serviceFiles = new Set([
    '/favicon.ico',
    '/frontend-db.js',
    '/robots.txt',
    '/sitemap.xml',
  ]);

  const isPathOrChild = (requestPath, routePath) => {
    return requestPath === routePath || requestPath.startsWith(`${routePath}/`);
  };

  const isServiceRoute = (requestPath) => {
    return serviceFiles.has(requestPath) || serviceRoutes.some((routePath) => isPathOrChild(requestPath, routePath));
  };

  return async (ctx, next) => {
    if ((ctx.method === 'GET' || ctx.method === 'HEAD') && ctx.path === timetablePath) {
      if (fs.existsSync(indexPath)) {
        ctx.type = 'text/html; charset=utf-8';

        if (ctx.method === 'HEAD') {
          ctx.status = 200;
          return;
        }

        ctx.body = fs.createReadStream(indexPath);
        return;
      }
    }

    if ((ctx.method === 'GET' || ctx.method === 'HEAD') && !isServiceRoute(ctx.path)) {
      ctx.redirect(timetablePath);
      return;
    }

    await next();
  };
};
