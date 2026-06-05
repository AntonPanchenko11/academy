'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HTML_PATH = path.resolve(__dirname, '..', '..', '..', 'course-page.html');
const JS_PATH = path.resolve(__dirname, '..', '..', '..', 'assets', 'course-page.js');
const CSS_PATH = path.resolve(__dirname, '..', '..', '..', 'assets', 'course-page.css');
const ROOT_MIDDLEWARE_PATH = path.resolve(__dirname, '..', 'src', 'middlewares', 'root-index.js');

const main = async () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const js = fs.readFileSync(JS_PATH, 'utf8');
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const rootMiddleware = fs.readFileSync(ROOT_MIDDLEWARE_PATH, 'utf8');

  assert.ok(html.includes('data-course-blocks'), 'Expected course page to include Dynamic Zone mount point');
  assert.ok(!html.includes('data-course-hero'), 'Expected course page not to include a static default hero');
  assert.ok(html.includes('/assets/course-page.js'), 'Expected course page to load renderer script');
  assert.ok(html.includes('/assets/course-page.css'), 'Expected course page to load renderer styles');

  [
    'course-blocks.hero',
    'course-blocks.text-section',
    'course-blocks.feature-list',
    'course-blocks.faq',
    'course-blocks.cta',
    'course-blocks.image-section',
  ].forEach((componentName) => {
    assert.ok(js.includes(componentName), `Expected renderer for ${componentName}`);
  });

  assert.ok(js.includes('contentBlocks'), 'Expected renderer to request contentBlocks');
  assert.ok(js.includes('buildDynamicHero'), 'Expected renderer to support editable Dynamic Zone hero');
  assert.ok(!js.includes('renderFallbackHero'), 'Expected renderer not to recreate deleted hero blocks');
  assert.ok(!js.includes('[data-course-hero]'), 'Expected renderer not to control a static default hero');
  assert.ok(js.includes('/api/tilda/courses/'), 'Expected renderer to load courses from public API');
  assert.ok(js.includes('encodeURIComponent(slug)'), 'Expected renderer to safely encode slug');
  assert.ok(js.includes('textContent'), 'Expected renderer to write text safely');
  assert.ok(!js.includes('innerHTML'), 'Expected renderer not to inject raw HTML from CMS content');

  assert.ok(css.includes('.course-blocks'), 'Expected styles for Dynamic Zone block list');
  assert.ok(css.includes('.course-faq-list'), 'Expected styles for FAQ block');
  assert.ok(rootMiddleware.includes('/^\\/courses\\/[^/]+\\/?$/.test(ctx.path)'), 'Expected /courses/:slug route');
  assert.ok(rootMiddleware.includes('/^\\/preview\\/courses\\/[^/]+\\/?$/.test(ctx.path)'), 'Expected preview route');

  console.log('course page renderer regression check passed');
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
