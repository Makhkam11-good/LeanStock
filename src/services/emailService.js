'use strict';

const {
  EMAIL_PROVIDER,
  EMAIL_FROM,
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
  if (EMAIL_PROVIDER === 'mock' || process.env.NODE_ENV === 'test') {
    logger.info('[Email:mock] Message queued', {
      to: message.to,
      subject: message.subject,
      event_type: message.event_type,
    });
    return { provider: 'mock', accepted: [message.to] };
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
      personalizations: [{ to: [{ email: message.to }] }],
      from: parseFromAddress(message.from),
      subject: message.subject,
      content: [
        { type: 'text/plain', value: message.text || stripHtml(message.html || '') },
        { type: 'text/html', value: message.html || message.text || '' },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SendGrid delivery failed with ${response.status}: ${body}`);
  }

  return { provider: 'sendgrid', status: response.status };
}

function parseFromAddress(value) {
  const match = value.match(/^(.*)<(.+)>$/);
  if (!match) return { email: value };
  return { name: match[1].trim(), email: match[2].trim() };
}

function stripHtml(value) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

module.exports = { enqueueEmail, sendEmailNow };
