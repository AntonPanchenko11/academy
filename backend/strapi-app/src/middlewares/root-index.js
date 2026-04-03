'use strict';

const fs = require('fs');
const path = require('path');

module.exports = (_config, { strapi }) => {
  const indexPath = path.join(strapi.dirs.static.public, 'index.html');

  return async (ctx, next) => {
    if ((ctx.method === 'GET' || ctx.method === 'HEAD') && ctx.path === '/') {
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

    await next();
  };
};
