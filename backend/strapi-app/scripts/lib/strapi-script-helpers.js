'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStrapi } = require('@strapi/strapi');

const APP_DIR = path.resolve(__dirname, '..', '..');
const ENV_PATH = path.join(APP_DIR, '.env');
const ENV_EXAMPLE_PATH = path.join(APP_DIR, '.env.example');
const FIXTURES_DIR = path.join(APP_DIR, 'scripts', 'fixtures');
const SQLITE_SEED_DB_PATH = path.join(FIXTURES_DIR, 'base-seed.db');

const applyEnvFile = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return false;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    const separatorIndex = trimmedLine.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1);

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }

  return true;
};

const loadEnvFile = (filePath = ENV_PATH) => {
  if (filePath !== ENV_PATH) {
    applyEnvFile(filePath);
    return;
  }

  if (applyEnvFile(ENV_PATH)) return;
  applyEnvFile(ENV_EXAMPLE_PATH);
};

const createTempDatabaseCopy = (prefix = 'academy-script-') => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const tempDbPath = path.join(tempDir, 'data.db');
  fs.copyFileSync(SQLITE_SEED_DB_PATH, tempDbPath);
  return { tempDir, tempDbPath };
};

const loadStrapiForScript = async () => {
  process.env.HOST = process.env.HOST || '127.0.0.1';
  process.env.PORT = process.env.PORT || '0';

  const strapi = createStrapi({
    appDir: APP_DIR,
    distDir: APP_DIR,
    autoReload: false,
    serveAdminPanel: false,
  });

  await strapi.load();
  return strapi;
};

module.exports = {
  APP_DIR,
  ENV_PATH,
  SQLITE_SEED_DB_PATH,
  createTempDatabaseCopy,
  loadEnvFile,
  loadStrapiForScript,
};
