'use strict';

const {
  EMAIL_PROVIDER,
  EMAIL_FROM,
  EMAIL_OVERRIDE_TO,
  SENDGRID_API_KEY,
  QUEUE_EMAIL_NAME,
} = require('../config/env');
const { enqueueJob } = require('../jobs/redisQueue');
const logger = require('../utils/logger');

async function enqueueEmail({ to, subject, text, html, event_type }) {
  if (!to) return null;
  return enqueueJob(QUEUE_EMAIL_NAME, 'email.send', {
    to,
    from: EMAIL_FROM,
    subject,
    text,
    html,
    event_type,
  });
}

async function sendEmailNow(message) {
  const resolvedMessage = applyRecipientOverride(message);

  if (EMAIL_PROVIDER === 'mock' || process.env.NODE_ENV === 'test') {
    logger.info('[Email:mock] Message queued', {
      to: resolvedMessage.to,
      subject: resolvedMessage.subject,
      event_type: resolvedMessage.event_type,
    });
    return { provider: 'mock', accepted: [resolvedMessage.to] };
  }

  if (EMAIL_PROVIDER !== 'sendgrid') {
    throw new Error(`Unsupported EMAIL_PROVIDER: ${EMAIL_PROVIDER}`);
  }

  if (!SENDGRID_API_KEY) {
    throw new Error('SENDGRID_API_KEY is required for SendGrid email delivery');
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: resolvedMessage.to }] }],
      from: parseFromAddress(resolvedMessage.from),
      subject: resolvedMessage.subject,
      content: [
        { type: 'text/plain', value: resolvedMessage.text || stripHtml(resolvedMessage.html || '') },
        { type: 'text/html', value: resolvedMessage.html || resolvedMessage.text || '' },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SendGrid delivery failed with ${response.status}: ${body}`);
  }

  return { provider: 'sendgrid', status: response.status };
}

function applyRecipientOverride(message) {
  if (!EMAIL_OVERRIDE_TO || EMAIL_OVERRIDE_TO === message.to) {
    return message;
  }

  const originalLine = `Original recipient: ${message.to}`;
  const text = message.text
    ? `${originalLine}\n\n${message.text}`
    : `${originalLine}\n\n${stripHtml(message.html || '')}`;
  const html = message.html
    ? `<p><strong>Original recipient:</strong> ${escapeHtml(message.to)}</p>${message.html}`
    : `<p><strong>Original recipient:</strong> ${escapeHtml(message.to)}</p><p>${escapeHtml(message.text || '')}</p>`;

  logger.info('[Email] Recipient override applied', {
    original_to: message.to,
    override_to: EMAIL_OVERRIDE_TO,
    event_type: message.event_type,
  });

  return {
    ...message,
    to: EMAIL_OVERRIDE_TO,
    text,
    html,
  };
}

function parseFromAddress(value) {
  const match = value.match(/^(.*)<(.+)>$/);
  if (!match) return { email: value };
  return { name: match[1].trim(), email: match[2].trim() };
}

function stripHtml(value) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { enqueueEmail, sendEmailNow };
