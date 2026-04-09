'use strict';

const { syncContentManagerConfig } = require('../src/utils/content-manager-config');
const {
  ENV_PATH,
  loadEnvFile,
  loadStrapiForScript,
} = require('./lib/strapi-script-helpers');

const main = async () => {
  loadEnvFile(ENV_PATH);
  const strapi = await loadStrapiForScript();

  try {
    const result = await syncContentManagerConfig(strapi);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await strapi.destroy();
  }
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
