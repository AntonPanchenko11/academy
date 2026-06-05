'use strict';

const crypto = require('node:crypto');

const { resolveSingleCourse } = require('../utils/tilda-course');
const { toTrimmedString } = require('../utils/course-reference');

const LEAD_UID = 'api::tilda-lead.tilda-lead';
const VERIFICATION_UID = 'api::tilda-lead-verification.tilda-lead-verification';
const ROUTING_RULE_UID = 'api::lead-routing-rule.lead-routing-rule';

const CHANNELS = ['sms', 'telegram', 'vk', 'flashcall'];
const DEFAULT_CODE_LENGTH = 4;
const DEFAULT_CODE_TTL_SECONDS = 600;
const DEFAULT_CODE_COOLDOWN_SECONDS = 60;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_DUPLICATE_WINDOW_SECONDS = 15 * 60;

const parseIntegerEnv = (name, fallback) => {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getConfig = () => {
  const appKeys = toTrimmedString(process.env.APP_KEYS || process.env.STRAPI_APP_KEYS, 1000);
  return {
    tildaToken: toTrimmedString(process.env.TILDA_LEADS_TOKEN, 500),
    sigmaApiBaseUrl: toTrimmedString(process.env.SIGMA_API_BASE_URL, 500) || 'https://user.sigmasms.ru/api',
    sigmaApiToken: toTrimmedString(process.env.SIGMA_API_TOKEN, 1000),
    sigmaIncomingTo: toTrimmedString(process.env.SIGMA_INCOMING_TO, 255),
    sigmaIncomingType: toTrimmedString(process.env.SIGMA_INCOMING_TYPE, 40) || 'sms',
    sigmaSmsSender: toTrimmedString(process.env.SIGMA_SMS_SENDER || process.env.SIGMA_CODE_SENDER, 255),
    sigmaVkSender: toTrimmedString(process.env.SIGMA_VK_SENDER || process.env.SIGMA_CODE_SENDER, 255),
    sigmaTelegramSender: toTrimmedString(process.env.SIGMA_TELEGRAM_SENDER, 255) || '-',
    sigmaFlashcallSender: toTrimmedString(process.env.SIGMA_FLASHCALL_SENDER || process.env.SIGMA_CODE_SENDER, 255),
    requestTimeoutMs: parseIntegerEnv('SIGMA_REQUEST_TIMEOUT_MS', 8000),
    codeLength: Math.min(parseIntegerEnv('TILDA_LEAD_CODE_LENGTH', DEFAULT_CODE_LENGTH), 8),
    codeTtlSeconds: parseIntegerEnv('TILDA_LEAD_CODE_TTL_SECONDS', DEFAULT_CODE_TTL_SECONDS),
    codeCooldownSeconds: parseIntegerEnv('TILDA_LEAD_CODE_COOLDOWN_SECONDS', DEFAULT_CODE_COOLDOWN_SECONDS),
    maxAttempts: parseIntegerEnv('TILDA_LEAD_CODE_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS),
    duplicateWindowSeconds: parseIntegerEnv('TILDA_LEAD_DUPLICATE_WINDOW_SECONDS', DEFAULT_DUPLICATE_WINDOW_SECONDS),
    hashSecret: toTrimmedString(process.env.TILDA_LEAD_CODE_SECRET, 1000)
      || appKeys
      || toTrimmedString(process.env.JWT_SECRET, 1000)
      || 'academy-tilda-leads',
  };
};

const getHeader = (ctx, name) => {
  if (ctx && typeof ctx.get === 'function') {
    return toTrimmedString(ctx.get(name), 1000);
  }

  const headers = ctx && ctx.headers ? ctx.headers : {};
  const lowerName = String(name || '').toLowerCase();
  const match = Object.keys(headers).find((key) => key.toLowerCase() === lowerName);
  return toTrimmedString(match ? headers[match] : '', 1000);
};

const getRequestPayload = (ctx) => {
  const body = ctx && ctx.request && ctx.request.body;
  if (!body) return {};
  if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) return body.data;
  if (typeof body === 'object' && !Array.isArray(body)) return body;
  return {};
};

const getRequestToken = (ctx, payload) => {
  return toTrimmedString(
    getHeader(ctx, 'X-Tilda-Lead-Token')
      || getHeader(ctx, 'X-Lead-Token')
      || (ctx && ctx.query && (ctx.query.token || ctx.query.leadToken))
      || payload.token
      || payload.leadToken,
    1000
  );
};

const isAuthorized = (ctx, payload, config) => {
  if (!config.tildaToken) return true;
  return getRequestToken(ctx, payload) === config.tildaToken;
};

const normalizeEmail = (value) => {
  const email = toTrimmedString(value, 320).toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
};

const normalizePhone = (value) => {
  const raw = toTrimmedString(value, 80);
  if (!raw) return '';

  const startsWithPlus = raw.trim().startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  if (!startsWithPlus && digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }

  const normalized = `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : '';
};

const normalizeChannel = (value) => {
  const channel = toTrimmedString(value, 40).toLowerCase();
  if (channel === 'telegramcode') return 'telegram';
  return CHANNELS.includes(channel) ? channel : '';
};

const normalizeCode = (value, codeLength) => {
  const code = toTrimmedString(value, 20).replace(/\D/g, '');
  return code.length === codeLength ? code : '';
};

const pickFirst = (payload, keys, maxLen = 255) => {
  for (const key of keys) {
    const value = toTrimmedString(payload && payload[key], maxLen);
    if (value) return value;
  }
  return '';
};

const normalizeLeadPayload = (payload = {}) => {
  const utm = payload.utm && typeof payload.utm === 'object' ? payload.utm : {};
  return {
    name: pickFirst(payload, ['name', 'Name', 'firstName', 'fio', 'ФИО', 'Имя'], 255),
    phone: normalizePhone(pickFirst(payload, ['phone', 'Phone', 'tel', 'Телефон'], 80)),
    email: normalizeEmail(pickFirst(payload, ['email', 'Email', 'mail', 'Почта'], 320)),
    courseSlug: pickFirst(payload, ['courseSlug', 'course', 'slug', 'Курс'], 255),
    courseTitle: pickFirst(payload, ['courseTitle', 'courseName'], 255),
    formId: pickFirst(payload, ['formId', 'formid', 'form_id', 'tildaFormId'], 255),
    pageUrl: pickFirst(payload, ['pageUrl', 'url', 'referrer', 'referer'], 1000),
    leadType: pickFirst(payload, ['leadType', 'type'], 120) || 'course_request',
    routeKey: pickFirst(payload, ['sigmaRoute', 'routeKey', 'route'], 120),
    utmSource: pickFirst({ ...utm, ...payload }, ['utm_source', 'source', 'utmSource'], 255),
    utmMedium: pickFirst({ ...utm, ...payload }, ['utm_medium', 'medium', 'utmMedium'], 255),
    utmCampaign: pickFirst({ ...utm, ...payload }, ['utm_campaign', 'campaign', 'utmCampaign'], 255),
    utmContent: pickFirst({ ...utm, ...payload }, ['utm_content', 'content', 'utmContent'], 255),
    utmTerm: pickFirst({ ...utm, ...payload }, ['utm_term', 'term', 'utmTerm'], 255),
  };
};

const sanitizeRawPayload = (payload = {}) => {
  const clone = JSON.parse(JSON.stringify(payload || {}));
  [
    'token',
    'leadToken',
    'verificationCode',
    'code',
    'otp',
  ].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(clone, key)) delete clone[key];
  });
  return clone;
};

const hashValue = (value, secret) => {
  return crypto.createHash('sha256').update(`${secret}:${value}`).digest('hex');
};

const generateNumericCode = (length) => {
  const min = 10 ** (length - 1);
  const max = (10 ** length) - 1;
  return String(crypto.randomInt(min, max + 1));
};

const buildIdempotencyKey = (lead) => {
  return hashValue([
    lead.phone,
    lead.email,
    lead.courseSlug,
    lead.formId,
    lead.leadType,
  ].join('|'), 'tilda-lead');
};

const buildSigmaUrl = (config, path) => {
  return `${config.sigmaApiBaseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
};

const createSigmaClient = ({ fetchImpl = global.fetch } = {}) => {
  const request = async (path, payload, config) => {
    if (!config.sigmaApiToken) {
      const error = new Error('SIGMA_API_TOKEN is not configured.');
      error.status = 503;
      throw error;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

    try {
      const response = await fetchImpl(buildSigmaUrl(config, path), {
        method: 'POST',
        headers: {
          Authorization: config.sigmaApiToken,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      let body = null;
      try {
        body = await response.json();
      } catch (error) {
        body = null;
      }

      if (!response.ok) {
        const message = toTrimmedString(
          (body && (body.message || body.error || body.type))
            || `SIGMA request failed with HTTP ${response.status}`,
          1000
        );
        const error = new Error(message);
        error.status = response.status;
        error.body = body;
        throw error;
      }

      return body;
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    sendVerificationCode(params, config) {
      return request('/sendings', buildVerificationSendingPayload(params, config), config);
    },
    createIncomingLead(params, config) {
      return request('/sendingsIncoming', buildIncomingLeadPayload(params, config), config);
    },
  };
};

const buildVerificationSendingPayload = ({ phone, channel, code, vkRecipient }, config) => {
  if (channel === 'telegram') {
    return {
      recipient: phone,
      type: 'telegramcode',
      payload: {
        sender: config.sigmaTelegramSender || '-',
        text: code,
      },
    };
  }

  if (channel === 'flashcall') {
    return {
      recipient: phone,
      type: 'flashcall',
      payload: {
        sender: config.sigmaFlashcallSender || 'Academy',
        text: code,
      },
    };
  }

  if (channel === 'vk') {
    return {
      recipient: toTrimmedString(vkRecipient, 80) || phone,
      type: 'vk',
      payload: {
        sender: config.sigmaVkSender || 'Academy',
        text: `Код подтверждения: ${code}`,
      },
    };
  }

  return {
    recipient: phone,
    type: 'sms',
    payload: {
      sender: config.sigmaSmsSender || 'Academy',
      text: `Код подтверждения: ${code}`,
    },
  };
};

const buildIncomingLeadText = ({ lead, route }) => {
  const lines = [
    'Новая заявка с сайта',
    '',
    lead.name ? `Имя: ${lead.name}` : '',
    `Телефон: ${lead.phone}`,
    lead.email ? `Email: ${lead.email}` : '',
    lead.courseTitle || lead.courseSlug ? `Курс: ${lead.courseTitle || lead.courseSlug}` : '',
    lead.leadType ? `Тип заявки: ${lead.leadType}` : '',
    lead.formId ? `Форма: ${lead.formId}` : '',
    lead.pageUrl ? `Страница: ${lead.pageUrl}` : '',
    lead.utmSource || lead.utmMedium || lead.utmCampaign
      ? `Источник: ${[lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(' / ')}`
      : '',
    lead.utmContent ? `UTM content: ${lead.utmContent}` : '',
    lead.utmTerm ? `UTM term: ${lead.utmTerm}` : '',
    route && route.sigmaTags && Array.isArray(route.sigmaTags) && route.sigmaTags.length
      ? `Теги: ${route.sigmaTags.join(', ')}`
      : '',
  ];

  return lines.filter((line) => line !== '').join('\n').slice(0, 3500);
};

const buildIncomingLeadPayload = ({ lead, route }, config) => {
  return {
    from: lead.phone,
    to: route.sigmaIncomingTo || config.sigmaIncomingTo,
    type: config.sigmaIncomingType,
    payload: {
      text: buildIncomingLeadText({ lead, route }),
    },
  };
};

const maybeQuery = (strapi, uid) => {
  try {
    return strapi && strapi.db && strapi.db.query(uid);
  } catch (error) {
    return null;
  }
};

const findRecentVerification = async ({ strapi, phone, config }) => {
  const query = maybeQuery(strapi, VERIFICATION_UID);
  if (!query || typeof query.findMany !== 'function') return null;

  const cutoff = new Date(Date.now() - (config.codeCooldownSeconds * 1000)).toISOString();
  const rows = await query.findMany({
    where: {
      phone,
      createdAt: { $gte: cutoff },
    },
    orderBy: { createdAt: 'desc' },
    limit: 1,
  });

  return Array.isArray(rows) && rows.length ? rows[0] : null;
};

const findDuplicateLead = async ({ strapi, lead, config }) => {
  const query = maybeQuery(strapi, LEAD_UID);
  if (!query || typeof query.findMany !== 'function') return null;

  const cutoff = new Date(Date.now() - (config.duplicateWindowSeconds * 1000)).toISOString();
  const rows = await query.findMany({
    where: {
      phone: lead.phone,
      courseSlug: lead.courseSlug || '',
      formId: lead.formId || '',
      createdAt: { $gte: cutoff },
    },
    orderBy: { createdAt: 'desc' },
    limit: 1,
  });

  return Array.isArray(rows) && rows.length ? rows[0] : null;
};

const resolveCourseForLead = async ({ lead, loadSerializedCourses, strapi }) => {
  if (typeof loadSerializedCourses !== 'function') return lead;

  const candidates = [
    lead.courseSlug,
    lead.pageUrl,
  ].filter(Boolean);
  if (!candidates.length) return lead;

  try {
    const courses = await loadSerializedCourses(strapi);
    for (const candidate of candidates) {
      const course = resolveSingleCourse(courses, { includeUnpublished: 'true' }, candidate);
      if (course) {
        return {
          ...lead,
          courseSlug: lead.courseSlug || toTrimmedString(course.slug, 255),
          courseTitle: lead.courseTitle || toTrimmedString(course.title, 255),
        };
      }
    }
  } catch (error) {
    return lead;
  }

  return lead;
};

const ruleMatches = (rule, lead) => {
  if (!rule || rule.enabled === false) return false;

  const fields = [
    ['routeKey', lead.routeKey],
    ['courseSlug', lead.courseSlug],
    ['leadType', lead.leadType],
    ['formId', lead.formId],
  ];

  let hasCondition = false;
  for (const [field, value] of fields) {
    const ruleValue = toTrimmedString(rule[field], 255);
    if (!ruleValue) continue;

    hasCondition = true;
    if (ruleValue.toLowerCase() !== toTrimmedString(value, 255).toLowerCase()) return false;
  }

  return hasCondition;
};

const resolveLeadRoute = async ({ strapi, lead, config }) => {
  const fallback = {
    routeKey: lead.routeKey || 'default',
    sigmaIncomingTo: config.sigmaIncomingTo,
    sigmaTags: [],
  };

  const query = maybeQuery(strapi, ROUTING_RULE_UID);
  if (!query || typeof query.findMany !== 'function') return fallback;

  const rules = await query.findMany({
    where: { enabled: true },
    orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    limit: 200,
  });

  const matched = (Array.isArray(rules) ? rules : []).find((rule) => ruleMatches(rule, lead));
  if (!matched) return fallback;

  return {
    routeKey: matched.routeKey || lead.routeKey || 'matched',
    sigmaIncomingTo: toTrimmedString(matched.sigmaIncomingTo, 255) || config.sigmaIncomingTo,
    sigmaTags: Array.isArray(matched.sigmaTags) ? matched.sigmaTags : [],
  };
};

const verifyLeadCode = async ({ strapi, verificationId, phone, code, config }) => {
  const query = maybeQuery(strapi, VERIFICATION_UID);
  if (!query || typeof query.findOne !== 'function') {
    return { ok: false, status: 503, error: 'Verification storage is unavailable.' };
  }

  const id = Number.parseInt(verificationId, 10);
  if (!Number.isFinite(id)) {
    return { ok: false, status: 422, error: 'Verification id is invalid.' };
  }

  const verification = await query.findOne({ where: { id } });
  if (!verification) {
    return { ok: false, status: 404, error: 'Verification not found.' };
  }

  if (verification.phone !== phone) {
    return { ok: false, status: 422, error: 'Verification phone does not match lead phone.' };
  }

  if (verification.status === 'confirmed') {
    return { ok: true, verification };
  }

  if (!['pending', 'sent'].includes(verification.status)) {
    return { ok: false, status: 422, error: 'Verification is not active.' };
  }

  if (new Date(verification.expiresAt).getTime() < Date.now()) {
    await query.update({ where: { id }, data: { status: 'expired' } });
    return { ok: false, status: 422, error: 'Verification code expired.' };
  }

  const attempts = Number.parseInt(verification.attempts || 0, 10);
  if (attempts >= config.maxAttempts) {
    return { ok: false, status: 429, error: 'Verification attempts exceeded.' };
  }

  if (hashValue(code, config.hashSecret) !== verification.codeHash) {
    await query.update({ where: { id }, data: { attempts: attempts + 1 } });
    return { ok: false, status: 422, error: 'Verification code is invalid.' };
  }

  const updated = await query.update({
    where: { id },
    data: {
      status: 'confirmed',
      attempts: attempts + 1,
    },
  });

  return { ok: true, verification: updated || verification };
};

const respondJson = (ctx, status, body) => {
  ctx.status = status;
  ctx.body = body;
};

const createTildaLeadGateway = ({ strapi, loadSerializedCourses, fetchImpl } = {}) => {
  const sigma = createSigmaClient({ fetchImpl });

  return {
    async respondStartVerification(ctx) {
      const config = getConfig();
      const payload = getRequestPayload(ctx);

      if (!isAuthorized(ctx, payload, config)) {
        respondJson(ctx, 401, { ok: false, error: 'Unauthorized.' });
        return;
      }

      const phone = normalizePhone(pickFirst(payload, ['phone', 'Phone', 'tel', 'Телефон'], 80));
      const channel = normalizeChannel(payload.channel || payload.verificationChannel);
      const vkRecipient = pickFirst(payload, ['vkRecipient', 'vkId', 'vk'], 80);

      if (!phone) {
        respondJson(ctx, 422, { ok: false, error: 'Valid phone is required.' });
        return;
      }

      if (!channel) {
        respondJson(ctx, 422, { ok: false, error: 'Verification channel is required.' });
        return;
      }

      const recent = await findRecentVerification({ strapi, phone, config });
      if (recent && ['pending', 'sent'].includes(recent.status)) {
        respondJson(ctx, 429, {
          ok: false,
          error: 'Verification code was sent recently.',
          retryAfterSeconds: config.codeCooldownSeconds,
        });
        return;
      }

      const code = generateNumericCode(config.codeLength);
      const expiresAt = new Date(Date.now() + (config.codeTtlSeconds * 1000)).toISOString();
      const query = maybeQuery(strapi, VERIFICATION_UID);

      if (!query || typeof query.create !== 'function') {
        respondJson(ctx, 503, { ok: false, error: 'Verification storage is unavailable.' });
        return;
      }

      const verification = await query.create({
        data: {
          phone,
          channel,
          status: 'pending',
          codeHash: hashValue(code, config.hashSecret),
          expiresAt,
          attempts: 0,
        },
      });

      try {
        const response = await sigma.sendVerificationCode({ phone, channel, code, vkRecipient }, config);
        const sigmaSendingId = toTrimmedString(response && response.id, 120);
        await query.update({
          where: { id: verification.id },
          data: {
            status: 'sent',
            sigmaSendingId,
          },
        });

        respondJson(ctx, 200, {
          ok: true,
          verificationId: verification.id,
          channel,
          expiresInSeconds: config.codeTtlSeconds,
        });
      } catch (error) {
        await query.update({
          where: { id: verification.id },
          data: {
            status: 'failed',
            lastError: toTrimmedString(error && error.message, 1000),
          },
        });

        respondJson(ctx, error.status && error.status >= 400 && error.status < 500 ? error.status : 502, {
          ok: false,
          error: toTrimmedString(error && error.message, 1000) || 'Failed to send verification code.',
        });
      }
    },

    async respondSubmitLead(ctx) {
      const config = getConfig();
      const payload = getRequestPayload(ctx);

      if (!isAuthorized(ctx, payload, config)) {
        respondJson(ctx, 401, { ok: false, error: 'Unauthorized.' });
        return;
      }

      const code = normalizeCode(payload.verificationCode || payload.code || payload.otp, config.codeLength);
      const verificationId = payload.verificationId;
      let lead = normalizeLeadPayload(payload);

      if (!lead.phone) {
        respondJson(ctx, 422, { ok: false, error: 'Valid phone is required.' });
        return;
      }

      if (!verificationId || !code) {
        respondJson(ctx, 422, { ok: false, error: 'Verification id and code are required.' });
        return;
      }

      const verification = await verifyLeadCode({
        strapi,
        verificationId,
        phone: lead.phone,
        code,
        config,
      });

      if (!verification.ok) {
        respondJson(ctx, verification.status || 422, { ok: false, error: verification.error });
        return;
      }

      lead = await resolveCourseForLead({ lead, loadSerializedCourses, strapi });
      lead.idempotencyKey = buildIdempotencyKey(lead);

      const duplicate = await findDuplicateLead({ strapi, lead, config });
      if (duplicate) {
        respondJson(ctx, 200, {
          ok: true,
          status: 'duplicate',
          leadId: duplicate.documentId || duplicate.id,
        });
        return;
      }

      const route = await resolveLeadRoute({ strapi, lead, config });
      if (!route.sigmaIncomingTo) {
        respondJson(ctx, 503, { ok: false, error: 'SIGMA_INCOMING_TO is not configured.' });
        return;
      }

      const leadQuery = maybeQuery(strapi, LEAD_UID);
      if (!leadQuery || typeof leadQuery.create !== 'function') {
        respondJson(ctx, 503, { ok: false, error: 'Lead storage is unavailable.' });
        return;
      }

      const sigmaRequest = buildIncomingLeadPayload({ lead, route }, config);
      const storedLead = await leadQuery.create({
        data: {
          ...lead,
          source: 'tilda',
          status: 'received',
          routeKey: route.routeKey,
          sigmaDestination: route.sigmaIncomingTo,
          sigmaRequest,
          rawPayload: sanitizeRawPayload(payload),
        },
      });

      try {
        const sigmaResponse = await sigma.createIncomingLead({ lead, route }, config);
        const sigmaIncomingId = toTrimmedString(sigmaResponse && sigmaResponse.id, 120);
        await leadQuery.update({
          where: { id: storedLead.id },
          data: {
            status: 'sent',
            sigmaIncomingId,
            sigmaResponse,
          },
        });

        respondJson(ctx, 202, {
          ok: true,
          status: 'sent',
          leadId: storedLead.documentId || storedLead.id,
          sigmaIncomingId,
        });
      } catch (error) {
        await leadQuery.update({
          where: { id: storedLead.id },
          data: {
            status: 'failed',
            sigmaResponse: error && error.body ? error.body : null,
            lastError: toTrimmedString(error && error.message, 1000),
          },
        });

        respondJson(ctx, 202, {
          ok: true,
          status: 'accepted',
          deliveryStatus: 'failed',
          leadId: storedLead.documentId || storedLead.id,
        });
      }
    },
  };
};

module.exports = {
  CHANNELS,
  buildIncomingLeadPayload,
  buildVerificationSendingPayload,
  createSigmaClient,
  createTildaLeadGateway,
  normalizeChannel,
  normalizeLeadPayload,
  normalizePhone,
};
