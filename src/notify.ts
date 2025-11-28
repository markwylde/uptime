import nodemailer from 'nodemailer';
import type { UrlConfig } from './config.ts';
import type { CheckResult, SslInfo } from './types.ts';

const SMTP_ENABLED = process.env.SMTP_ENABLED === 'true';
const SMTP_HOST = process.env.SMTP_HOST || 'localhost';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_TLS = process.env.SMTP_TLS === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || '';
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || '';
const SMTP_FROM_ADDRESS = process.env.SMTP_FROM_ADDRESS || 'uptime@localhost';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      requireTLS: SMTP_TLS,
      auth: SMTP_USER && SMTP_PASSWORD ? {
        user: SMTP_USER,
        pass: SMTP_PASSWORD,
      } : undefined,
    });
  }
  return transporter;
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  if (!SMTP_ENABLED || !SMTP_HOST || SMTP_HOST === 'localhost') {
    console.log('[notify] SMTP not configured, logging email instead:');
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body: ${body}`);
    return;
  }

  try {
    const fromAddress = SMTP_FROM_NAME
      ? `"${SMTP_FROM_NAME}" <${SMTP_FROM_ADDRESS}>`
      : SMTP_FROM_ADDRESS;

    await getTransporter().sendMail({
      from: fromAddress,
      to,
      subject,
      text: body,
    });
    console.log(`[notify] Email sent to ${to}`);
  } catch (err) {
    console.error(`[notify] Failed to send email: ${(err as Error).message}`);
  }
}

export async function notifyDown(urlConfig: UrlConfig, result: CheckResult, emails: string[]): Promise<void> {
  const subject = `[DOWN] ${urlConfig.name} is not responding`;
  const body = `
Service: ${urlConfig.name}
URL: ${urlConfig.url}
Status: DOWN
Error: ${result.error || 'Unknown error'}
Response Time: ${result.responseTime ? result.responseTime + 'ms' : 'N/A'}
Status Code: ${result.statusCode || 'N/A'}
Time: ${result.timestamp}
`.trim();

  for (const email of emails) {
    await sendEmail(email, subject, body);
  }
}

export async function notifyUp(urlConfig: UrlConfig, result: CheckResult, emails: string[]): Promise<void> {
  const subject = `[UP] ${urlConfig.name} has recovered`;
  const body = `
Service: ${urlConfig.name}
URL: ${urlConfig.url}
Status: UP
Response Time: ${result.responseTime}ms
Time: ${result.timestamp}
`.trim();

  for (const email of emails) {
    await sendEmail(email, subject, body);
  }
}

export async function notifySslExpiring(urlConfig: UrlConfig, sslInfo: SslInfo, emails: string[]): Promise<void> {
  const subject = `[SSL] ${urlConfig.name} certificate expiring soon`;
  const body = `
Service: ${urlConfig.name}
URL: ${urlConfig.url}
Certificate: Expiring in ${sslInfo.daysRemaining} days
Expires: ${sslInfo.validTo}
Subject: ${sslInfo.subject}
Issuer: ${sslInfo.issuer}
`.trim();

  for (const email of emails) {
    await sendEmail(email, subject, body);
  }
}
