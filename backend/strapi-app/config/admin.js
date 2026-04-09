
module.exports = ({ env }) => ({
  url: env('ADMIN_URL', 'http://localhost:1337/admin'),
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
    sessions: {
      accessTokenLifespan: env.int('ADMIN_ACCESS_TOKEN_LIFESPAN', 30 * 60),
      maxRefreshTokenLifespan: env.int('ADMIN_MAX_REFRESH_TOKEN_LIFESPAN', 30 * 24 * 60 * 60),
      idleRefreshTokenLifespan: env.int('ADMIN_IDLE_REFRESH_TOKEN_LIFESPAN', 14 * 24 * 60 * 60),
      maxSessionLifespan: env.int('ADMIN_MAX_SESSION_LIFESPAN', 24 * 60 * 60),
      idleSessionLifespan: env.int('ADMIN_IDLE_SESSION_LIFESPAN', 2 * 60 * 60),
    },
  },
  secrets: {
    encryptionKey: env('ENCRYPTION_KEY', env('STRAPI_ENCRYPTION_KEY')),
  },
  apiToken: {
    salt: env('API_TOKEN_SALT'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT'),
    },
  },
});
