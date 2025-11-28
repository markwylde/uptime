import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';
import type { UrlConfig, SettingsConfig } from './config.ts';
import type { SslInfo, CheckResult } from './types.ts';

export type { SslInfo, CheckResult };

interface RequestOptions {
  method: string;
  timeout: number;
  followRedirects: boolean;
  maxRedirects: number;
  userAgent: string;
  checkSsl?: boolean;
}

interface HttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  sslInfo: SslInfo | null;
}

export async function checkUrl(urlConfig: UrlConfig, globalSettings: SettingsConfig): Promise<CheckResult> {
  const settings = { ...globalSettings, ...urlConfig };
  const startTime = Date.now();

  const result: CheckResult = {
    name: urlConfig.name,
    url: urlConfig.url,
    success: false,
    statusCode: null,
    responseTime: null,
    error: null,
    sslInfo: null,
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await makeRequest(urlConfig.url, {
      method: settings.method || 'GET',
      timeout: (settings.timeout || settings.default_timeout || 30) * 1000,
      followRedirects: settings.follow_redirects !== false,
      maxRedirects: settings.max_redirects || 5,
      userAgent: settings.user_agent || 'Uptime-Monitor/1.0',
      checkSsl: settings.check_ssl,
    });

    result.statusCode = response.statusCode;
    result.responseTime = Date.now() - startTime;
    result.sslInfo = response.sslInfo;

    const expectedStatus = settings.expected_status || [200];
    const statusOk = expectedStatus.includes(response.statusCode);

    if (!statusOk) {
      result.error = `Unexpected status code: ${response.statusCode}`;
      return result;
    }

    if (settings.expected_content) {
      if (!response.body.includes(settings.expected_content)) {
        result.error = `Expected content not found: "${settings.expected_content}"`;
        return result;
      }
    }

    if (settings.response_time_threshold && result.responseTime > settings.response_time_threshold) {
      result.error = `Response time ${result.responseTime}ms exceeds threshold ${settings.response_time_threshold}ms`;
      return result;
    }

    result.success = true;
  } catch (err) {
    result.responseTime = Date.now() - startTime;
    result.error = (err as Error).message;
  }

  return result;
}

function makeRequest(urlString: string, options: RequestOptions, redirectCount = 0): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    const requestOptions: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method,
      timeout: options.timeout,
      headers: {
        'User-Agent': options.userAgent,
      },
    };

    const req = transport.request(requestOptions, (res) => {
      let body = '';
      let sslInfo: SslInfo | null = null;

      if (isHttps && options.checkSsl && res.socket) {
        const socket = res.socket as any;
        const cert = socket.getPeerCertificate();
        if (cert && cert.valid_to) {
          sslInfo = {
            valid: true,
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            issuer: cert.issuer?.O,
            subject: cert.subject?.CN,
            daysRemaining: Math.floor((new Date(cert.valid_to).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
          };
        }
      }

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode!) && options.followRedirects) {
          if (redirectCount >= options.maxRedirects) {
            reject(new Error(`Too many redirects (max: ${options.maxRedirects})`));
            return;
          }
          const location = res.headers.location;
          if (!location) {
            reject(new Error('Redirect without location header'));
            return;
          }
          const redirectUrl = new URL(location, urlString).href;
          makeRequest(redirectUrl, options, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        resolve({
          statusCode: res.statusCode!,
          headers: res.headers,
          body,
          sslInfo,
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${options.timeout}ms`));
    });

    req.end();
  });
}
