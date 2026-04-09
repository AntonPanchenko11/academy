'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const appDir = path.resolve(__dirname, '..');
const isolatedHome = path.join(appDir, '.tmp', 'strapi-home');
const isolatedConfigHome = path.join(isolatedHome, '.config');

fs.mkdirSync(isolatedConfigHome, { recursive: true });

const env = {
  ...process.env,
  HOME: isolatedHome,
  XDG_CONFIG_HOME: isolatedConfigHome,
  APPDATA: isolatedConfigHome,
  LOCALAPPDATA: isolatedConfigHome,
};

const strapiBin = path.join(appDir, 'node_modules', '.bin', 'strapi');
const result = spawnSync(process.execPath, [strapiBin, 'build'], {
  cwd: appDir,
  env,
  stdio: 'inherit',
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
