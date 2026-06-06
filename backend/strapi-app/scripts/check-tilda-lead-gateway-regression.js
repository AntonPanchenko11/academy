'use strict';

const assert = require('node:assert/strict');

const {
  buildBitrixLeadPayload,
  buildIncomingLeadPayload,
  buildVerificationSendingPayload,
  createTildaLeadGateway,
  getVerificationChannelConfig,
  normalizePhone,
} = require('../src/server/tilda-leads-gateway');

const createMockQuery = () => {
  const rows = [];
  let nextId = 1;

  return {
    rows,
    async create({ data }) {
      const row = {
        id: nextId,
        documentId: `doc-${nextId}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...data,
      };
      nextId += 1;
      rows.push(row);
      return row;
    },
    async update({ where, data }) {
      const row = rows.find((item) => item.id === where.id);
      if (!row) return null;
      Object.assign(row, data, { updatedAt: new Date().toISOString() });
      return row;
    },
    async findOne({ where }) {
      return rows.find((item) => item.id === where.id) || null;
    },
    async findMany(params = {}) {
      const where = params.where || {};
      let result = rows.filter((row) => {
        return Object.keys(where).every((key) => {
          if (key === 'createdAt' && where.createdAt && where.createdAt.$gte) {
            return new Date(row.createdAt).getTime() >= new Date(where.createdAt.$gte).getTime();
          }
          return row[key] === where[key];
        });
      });

      if (Array.isArray(params.orderBy) || params.orderBy) {
        result = result.slice().sort((a, b) => b.id - a.id);
      }

      return typeof params.limit === 'number' ? result.slice(0, params.limit) : result;
    },
  };
};

const createMockCtx = ({ path = '/api/tilda/leads', body = {}, query = {}, headers = {} }) => {
  const ctx = {
    method: 'POST',
    path,
    query,
    headers,
    request: { body },
    _status: 404,
  };

  Object.defineProperty(ctx, 'status', {
    get() {
      return this._status;
    },
    set(value) {
      this._status = value;
    },
  });

  Object.defineProperty(ctx, 'body', {
    get() {
      return this._body;
    },
    set(value) {
      this._body = value;
      if (this._status === 404) this._status = 200;
    },
  });

  ctx.get = (name) => headers[name] || headers[name.toLowerCase()] || '';
  return ctx;
};

const main = async () => {
  const previousEnv = { ...process.env };
  process.env.TILDA_LEADS_TOKEN = 'form-token';
  process.env.SIGMA_API_TOKEN = 'sigma-token';
  process.env.SIGMA_INCOMING_TO = 'ModernPsy';
  process.env.SIGMA_SMS_SENDER = 'RegisteredSmsSender';
  process.env.SIGMA_VK_SENDER = 'RegisteredVkSender';
  process.env.SIGMA_FLASHCALL_SENDER = 'RegisteredFlashSender';
  process.env.SIGMA_TELEGRAM_SENDER = '-';
  process.env.TILDA_LEAD_CODE_SECRET = 'test-secret';
  process.env.TILDA_LEAD_CODE_COOLDOWN_SECONDS = '1';
  process.env.BITRIX24_WEBHOOK_BASE_URL = 'https://example.bitrix24.ru/rest/1/webhook';
  process.env.BITRIX24_CREATE_LEADS = 'true';

  const queries = {
    'api::tilda-lead.tilda-lead': createMockQuery(),
    'api::tilda-lead-verification.tilda-lead-verification': createMockQuery(),
    'api::lead-routing-rule.lead-routing-rule': createMockQuery(),
  };

  await queries['api::lead-routing-rule.lead-routing-rule'].create({
    data: {
      enabled: true,
      priority: 1,
      courseSlug: 'act',
      sigmaIncomingTo: 'ModernPsyCourses',
      sigmaTags: ['course'],
    },
  });

  const sigmaCalls = [];
  let lastCode = '';
  const fetchImpl = async (url, options) => {
    const payload = JSON.parse(options.body);
    sigmaCalls.push({ url, payload });
    if (url.endsWith('/sendings')) {
      lastCode = payload.payload.text.replace(/\D/g, '');
      return {
        ok: true,
        json: async () => ({ id: 'sigma-code-id', status: 'pending' }),
      };
    }

    if (url.endsWith('/crm.lead.add')) {
      return {
        ok: true,
        json: async () => ({ result: 321 }),
      };
    }

    return {
      ok: true,
      json: async () => ({ id: 'sigma-incoming-id' }),
    };
  };

  const strapi = {
    db: {
      query(uid) {
        return queries[uid];
      },
    },
  };

  const gateway = createTildaLeadGateway({
    strapi,
    loadSerializedCourses: async () => [
      {
        id: 1,
        publish: true,
        slug: 'act',
        title: 'Актерское мастерство',
        courseLink: 'https://modern-psy.ru/act',
        coursePath: '/act',
      },
    ],
    fetchImpl,
  });

  assert.equal(normalizePhone('8 (999) 123-45-67'), '+79991234567');
  assert.deepEqual(buildVerificationSendingPayload({
    phone: '+79991234567',
    channel: 'telegram',
    code: '1234',
  }, {
    sigmaTelegramSender: '-',
  }), {
    recipient: '+79991234567',
    type: 'telegramcode',
    payload: {
      sender: '-',
      text: '1234',
    },
  });

  assert.deepEqual(buildVerificationSendingPayload({
    phone: '+79991234567',
    channel: 'sms',
    code: '1234',
  }, {
    sigmaSmsSender: 'RegisteredSmsSender',
  }), {
    recipient: '+79991234567',
    type: 'sms',
    payload: {
      sender: 'RegisteredSmsSender',
      text: 'Код подтверждения: 1234',
    },
  });

  assert.deepEqual(buildVerificationSendingPayload({
    phone: '+79991234567',
    channel: 'vk',
    code: '1234',
  }, {
    sigmaVkSender: 'RegisteredVkSender',
  }), {
    recipient: '+79991234567',
    type: 'vk',
    payload: {
      sender: 'RegisteredVkSender',
      text: 'Код подтверждения: 1234',
    },
  });

  assert.deepEqual(buildVerificationSendingPayload({
    phone: '+79991234567',
    channel: 'flashcall',
    code: '1234',
  }, {
    sigmaFlashcallSender: 'RegisteredFlashSender',
  }), {
    recipient: '+79991234567',
    type: 'flashcall',
    payload: {
      sender: 'RegisteredFlashSender',
      text: '1234',
    },
  });

  assert.deepEqual(getVerificationChannelConfig({
    sigmaSmsSender: '',
    sigmaTelegramSender: '-',
    sigmaVkSender: '',
    sigmaFlashcallSender: '',
  }), {
    sms: { enabled: false, requiredEnv: 'SIGMA_SMS_SENDER' },
    telegram: { enabled: true, requiredEnv: 'SIGMA_TELEGRAM_SENDER' },
    vk: { enabled: false, requiredEnv: 'SIGMA_VK_SENDER' },
    flashcall: { enabled: false, requiredEnv: 'SIGMA_FLASHCALL_SENDER' },
  });

  const startCtx = createMockCtx({
    path: '/api/tilda/lead-verification/start',
    headers: { 'X-Tilda-Lead-Token': 'form-token' },
    body: {
      phone: '8 (999) 123-45-67',
      channel: 'sms',
    },
  });
  await gateway.respondStartVerification(startCtx);
  assert.equal(startCtx.status, 200);
  assert.equal(startCtx.body.ok, true);
  assert.equal(startCtx.body.verificationId, 1);
  assert.equal(sigmaCalls[0].payload.type, 'sms');
  assert.equal(lastCode.length, 4);

  const leadCtx = createMockCtx({
    headers: { 'X-Tilda-Lead-Token': 'form-token' },
    body: {
      verificationId: startCtx.body.verificationId,
      verificationCode: lastCode,
      name: 'Иван',
      phone: '+79991234567',
      email: 'IVAN@EXAMPLE.COM',
      comment: 'Хочу узнать детали',
      courseSlug: 'act',
      formId: 'main-form',
      pageUrl: 'https://modern-psy.ru/act',
      utm_source: 'yandex',
    },
  });
  await gateway.respondSubmitLead(leadCtx);
  assert.equal(leadCtx.status, 202);
  assert.equal(leadCtx.body.ok, true);
  assert.equal(leadCtx.body.status, 'sent');
  assert.equal(leadCtx.body.bitrixStatus, 'sent');
  assert.equal(leadCtx.body.bitrixLeadId, '321');
  assert.equal(leadCtx.body.sigmaIncomingId, 'sigma-incoming-id');
  assert.equal(sigmaCalls[1].payload.fields.TITLE, 'Заявка с сайта: Актерское мастерство');
  assert.equal(sigmaCalls[1].payload.fields.NAME, 'Иван');
  assert.deepEqual(sigmaCalls[1].payload.fields.PHONE, [{ VALUE: '+79991234567', VALUE_TYPE: 'WORK' }]);
  assert.equal(sigmaCalls[1].payload.fields.UTM_SOURCE, 'yandex');
  assert.ok(sigmaCalls[1].payload.fields.COMMENTS.includes('Хочу узнать детали'));
  assert.equal(sigmaCalls[2].payload.to, 'ModernPsyCourses');
  assert.equal(sigmaCalls[2].payload.from, '+79991234567');
  assert.ok(sigmaCalls[2].payload.payload.text.includes('Актерское мастерство'));

  const builtIncoming = buildIncomingLeadPayload({
    lead: {
      phone: '+79991234567',
      name: 'Иван',
      email: 'ivan@example.com',
      courseSlug: 'act',
      leadType: 'course_request',
    },
    route: {
      sigmaIncomingTo: 'ModernPsy',
      sigmaTags: [],
    },
  }, {
    sigmaIncomingType: 'sms',
  });
  assert.equal(builtIncoming.to, 'ModernPsy');
  assert.equal(builtIncoming.type, 'sms');

  const builtBitrix = buildBitrixLeadPayload({
    lead: {
      phone: '+79991234567',
      name: 'Иван',
      email: 'ivan@example.com',
      courseSlug: 'act',
      leadType: 'course_request',
      idempotencyKey: 'lead-key',
      pageUrl: 'https://modern-psy.ru/act',
    },
    route: {
      sigmaIncomingTo: 'ModernPsy',
      sigmaTags: [],
    },
  }, {
    bitrixSourceId: 'WEB',
    bitrixAssignedById: 7,
  });
  assert.equal(builtBitrix.fields.SOURCE_ID, 'WEB');
  assert.equal(builtBitrix.fields.ASSIGNED_BY_ID, 7);
  assert.equal(builtBitrix.fields.ORIGIN_ID, 'lead-key');
  assert.deepEqual(builtBitrix.params, { REGISTER_SONET_EVENT: 'Y' });

  process.env = previousEnv;
  console.log('tilda lead gateway regression check passed');
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
