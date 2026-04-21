'use strict';

const { migrateCourseBasePrice, migrateCourseImageFields } = require('../src/utils/course');
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
    const courseBasePriceMigration = await migrateCourseBasePrice(strapi);
    const courseImageFieldsMigration = await migrateCourseImageFields(strapi);
    const configSync = await syncContentManagerConfig(strapi);

    console.log(JSON.stringify({
      courseBasePriceMigration,
      courseImageFieldsMigration,
      configSync,
    }, null, 2));
  } finally {
    await strapi.destroy();
  }
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
