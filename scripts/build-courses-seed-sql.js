#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const inputPath = path.resolve(__dirname, '..', 'extracted-courses.json');
const seedYear = Number(process.env.SEED_YEAR) || new Date().getFullYear();

const monthToNumber = {
  'Январь': 1,
  'Февраль': 2,
  'Март': 3,
  'Апрель': 4,
  'Май': 5,
  'Июнь': 6,
  'Июль': 7,
  'Август': 8,
  'Сентябрь': 9,
  'Октябрь': 10,
  'Ноябрь': 11,
  'Декабрь': 12,
};

const supportedDocuments = new Set(['Диплом', 'Удостоверение', 'Сертификат']);
const supportedStatuses = new Set(['Идет набор', 'Последний шанс']);

function sqlString(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseHours(value) {
  if (!value) return null;
  const digits = String(value).match(/\d+/g);
  if (!digits || !digits.length) return null;
  const parsed = Number(digits.join(''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(dayRaw, monthName) {
  if (!dayRaw || !monthName) return null;

  const month = monthToNumber[monthName];
  if (!month) return null;

  const firstDayToken = String(dayRaw).match(/\d+/);
  if (!firstDayToken) return null;

  const day = Number(firstDayToken[0]);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${seedYear}-${mm}-${dd}`;
}

function normalizeStatus(value) {
  if (!value) return 'Идет набор';
  const trimmed = String(value).trim();
  if (trimmed === 'Идёт набор') return 'Идет набор';
  return supportedStatuses.has(trimmed) ? trimmed : null;
}

function normalizeDocument(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  return supportedDocuments.has(trimmed) ? trimmed : null;
}

function makeCourse(item, index, monthName, isWaitlist) {
  return {
    documentId: `seed-${seedYear}-${String(index + 1).padStart(3, '0')}`,
    title: item.title || '',
    publish: true,
    comment: item.subtitle || null,
    date: isWaitlist ? null : parseDate(item.day, monthName),
    waitlist: isWaitlist,
    courseStatus: isWaitlist ? null : normalizeStatus(item.status),
    studyDays: item.weekday ? item.weekday.trim() : null,
    hours: parseHours(item.hours),
    price: item.price ? String(item.price).trim() : 'По запросу',
    educationDocument: normalizeDocument(item.certificate),
    courseLink: item.href || '#',
  };
}

function loadCourses(payload) {
  const rows = [];
  let idx = 0;

  for (const [monthName, cards] of Object.entries(payload.months || {})) {
    for (const card of cards) {
      rows.push(makeCourse(card, idx, monthName, false));
      idx += 1;
    }
  }

  for (const card of payload.undated || []) {
    rows.push(makeCourse(card, idx, null, true));
    idx += 1;
  }

  return rows;
}

const raw = fs.readFileSync(inputPath, 'utf8');
const payload = JSON.parse(raw);
const courses = loadCourses(payload);

const header = [
  '-- Auto-generated seed SQL from extracted-courses.json',
  '-- Run with: docker exec -i academy-postgres-1 psql -U strapi -d academy < /tmp/courses-seed.sql',
  'BEGIN;',
  'TRUNCATE TABLE courses RESTART IDENTITY;',
  'INSERT INTO courses (document_id, title, publish, comment, date, waitlist, course_status, study_days, hours, price, education_document, course_link, created_at, updated_at, published_at)',
  'VALUES',
].join('\n');

const values = courses
  .map((course) => {
    return `(${[
      sqlString(course.documentId),
      sqlString(course.title),
      course.publish ? 'TRUE' : 'FALSE',
      sqlString(course.comment),
      sqlString(course.date),
      course.waitlist ? 'TRUE' : 'FALSE',
      sqlString(course.courseStatus),
      sqlString(course.studyDays),
      course.hours === null ? 'NULL' : String(course.hours),
      sqlString(course.price),
      sqlString(course.educationDocument),
      sqlString(course.courseLink),
      'NOW()',
      'NOW()',
      'NOW()',
    ].join(', ')})`;
  })
  .join(',\n');

const footer = ';\nCOMMIT;\n';

process.stdout.write(`${header}\n${values}${footer}`);
