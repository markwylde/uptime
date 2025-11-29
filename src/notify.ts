import nodemailer from 'nodemailer';
import type { UrlConfig } from './config.ts';
import type { CheckResult, SslInfo } from './types.ts';

let transporter: nodemailer.Transporter | null = null;

function getSmtpConfig() {
  return {
    enabled: process.env.SMTP_ENABLED === 'true',
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    tls: process.env.SMTP_TLS === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    fromName: process.env.SMTP_FROM_NAME || '',
    fromAddress: process.env.SMTP_FROM_ADDRESS || 'uptime@localhost',
  };
}

function getTransporter(): nodemailer.Transporter {
  const config = getSmtpConfig();
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      requireTLS: config.tls,
      auth: config.user && config.password ? {
        user: config.user,
        pass: config.password,
      } : undefined,
    });
  }
  return transporter;
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const config = getSmtpConfig();
  if (!config.enabled || !config.host || config.host === 'localhost') {
    console.log('[notify] SMTP not configured, logging email instead:');
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body: ${body}`);
    return;
  }

  try {
    const fromAddress = config.fromName
      ? `"${config.fromName}" <${config.fromAddress}>`
      : config.fromAddress;

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
