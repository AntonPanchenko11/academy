const parseListEnv = (value, fallback) => {
  const raw = typeof value === 'string' ? value : '';
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length ? items : fallback;
};

module.exports = ({ env }) => ([
  'strapi::logger',
  'strapi::errors',
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'connect-src': ["'self'", 'http:', 'https:'],
          'img-src': parseListEnv(env('IMG_ORIGIN'), ["'self'", 'data:', 'blob:', 'market-assets.strapi.io']),
          upgradeInsecureRequests: null,
        },
      },
    },
  },
  {
    name: 'strapi::cors',
    config: {
      origin: parseListEnv(env('CORS_ORIGIN'), ['*']),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
      keepHeaderOnError: true,
    },
  },
  'global::root-index',
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
]);
