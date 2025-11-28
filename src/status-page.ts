import http from 'node:http';
import { getRecentChecks } from './store.ts';
import { generateResponseTimeChart, generateUptimeChart } from './chart.ts';
import type { Config } from './config.ts';

interface ServiceStatus {
  status: string;
  lastCheck: string;
  responseTime: number | null;
  error: string | null;
  sslInfo: any;
  category?: string;
  name: string;
}

interface Incident {
  service: string;
  error: string;
  timestamp: string;
  resolved: boolean;
  resolvedAt: string | null;
}

interface StatusData {
  title: string;
  lastUpdate: string | null;
  services: ServiceStatus[];
  incidents: Incident[];
}

let server: http.Server | null = null;
let statusData: StatusData = {
  title: 'System Status',
  lastUpdate: null,
  services: [],
  incidents: [],
};
let retentionHours = 120;

export function setRetentionHours(hours: number): void {
  retentionHours = hours;
}

export function updateStatus(services: ServiceStatus[], config: Config): void {
  statusData.title = config?.status_page?.title || 'System Status';
  statusData.services = services;
  statusData.lastUpdate = new Date().toISOString();
}

export function addIncident(service: string, error: string, timestamp: string): void {
  statusData.incidents.unshift({
    service,
    error,
    timestamp,
    resolved: false,
    resolvedAt: null,
  });

  const retentionDays = 90;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  statusData.incidents = statusData.incidents.filter(
    (i) => new Date(i.timestamp).getTime() > cutoff
  );
}

export function resolveIncident(service: string): void {
  const incident = statusData.incidents.find(
    (i) => i.service === service && !i.resolved
  );
  if (incident) {
    incident.resolved = true;
    incident.resolvedAt = new Date().toISOString();
  }
}

export function startStatusServer(port: number | string = 3070): http.Server {
  server = http.createServer((req, res) => {
    if (req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(statusData, null, 2));
      return;
    }

    if (req.url?.startsWith('/api/history/')) {
      const serviceName = decodeURIComponent(req.url.slice('/api/history/'.length));
      const checks = getRecentChecks(serviceName, 100);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(checks, null, 2));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderHtml());
  });

  server.listen(port, () => {
    console.log(`[status] Status page running at http://localhost:${port}`);
  });

  return server;
}

export function stopStatusServer(): void {
  if (server) {
    server.close();
    server = null;
  }
}

function renderHtml(): string {
  // Group services by category while preserving order
  const categories: string[] = [];
  const groupedServices: Record<string, ServiceStatus[]> = {};

  for (const svc of statusData.services) {
    const category = svc.category || 'Uncategorized';
    if (!groupedServices[category]) {
      groupedServices[category] = [];
      categories.push(category);
    }
    groupedServices[category].push(svc);
  }

  const allUp = statusData.services.length > 0 && statusData.services.every((s) => s.status === 'up');
  const hasServices = statusData.services.length > 0;

  let servicesHtml = '';
  for (const category of categories) {
    const services = groupedServices[category];
    servicesHtml += `<div class="category"><div class="category-header">${escapeHtml(category)}</div>`;
    for (const svc of services) {
      const statusClass = svc.status === 'up' ? 'up' : 'down';
      const statusText = svc.status === 'up' ? 'Operational' : 'Down';
      const responseTime = svc.responseTime ? `${svc.responseTime}ms` : '-';

      const checks = getRecentChecks(svc.name, 50);
      const responseTimeChart = generateResponseTimeChart(checks);
      const uptimeChart = generateUptimeChart(checks);

      servicesHtml += `
        <div class="service-card">
          <div class="service-header">
            <div class="service-title">
              <span class="service-name">${escapeHtml(svc.name)}</span>
              <span class="service-latency">${responseTime}</span>
            </div>
            <span class="status-pill ${statusClass}">${statusText}</span>
          </div>
          <div class="service-charts">
            <div class="chart-row">
              <span class="chart-title">Response Time</span>
              ${responseTimeChart}
            </div>
            <div class="chart-row">
              <span class="chart-title">Uptime</span>
              ${uptimeChart}
            </div>
          </div>
        </div>
      `;
    }
    servicesHtml += '</div>';
  }

  const recentIncidents = statusData.incidents.slice(0, 5);
  let incidentsHtml = '';
  if (recentIncidents.length > 0) {
    incidentsHtml = '<div class="section"><div class="section-title">Recent Incidents</div>';
    for (const inc of recentIncidents) {
      const resolved = inc.resolved;
      const statusClass = resolved ? 'resolved' : 'ongoing';
      const statusText = resolved ? 'Resolved' : 'Ongoing';
      incidentsHtml += `
        <div class="incident ${statusClass}">
          <div class="incident-top">
            <span class="incident-name">${escapeHtml(inc.service)}</span>
            <span class="incident-badge ${statusClass}">${statusText}</span>
          </div>
          <div class="incident-message">${escapeHtml(inc.error)}</div>
          <div class="incident-time">${formatTime(inc.timestamp)}${resolved ? ` · Resolved ${formatTime(inc.resolvedAt!)}` : ''}</div>
        </div>
      `;
    }
    incidentsHtml += '</div>';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(statusData.title)}</title>
  <meta http-equiv="refresh" content="30">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      line-height: 1.5;
      min-height: 100vh;
    }
    .header {
      background: #fff;
      border-bottom: 1px solid #e2e8f0;
      padding: 32px 20px;
      text-align: center;
    }
    .header h1 {
      font-size: 22px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .overall-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 24px;
      font-size: 14px;
      font-weight: 500;
    }
    .overall-badge.up {
      background: #dcfce7;
      color: #166534;
    }
    .overall-badge.down {
      background: #fee2e2;
      color: #991b1b;
    }
    .overall-badge .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }
    .container {
      max-width: 680px;
      margin: 0 auto;
      padding: 24px 16px;
    }
    .category {
      margin-bottom: 24px;
    }
    .category-header {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 12px;
    }
    .service-card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .service-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .service-title {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .service-name {
      font-size: 15px;
      font-weight: 600;
    }
    .service-latency {
      font-size: 12px;
      color: #94a3b8;
    }
    .status-pill {
      font-size: 12px;
      font-weight: 500;
      padding: 4px 10px;
      border-radius: 12px;
    }
    .status-pill.up {
      background: #dcfce7;
      color: #166534;
    }
    .status-pill.down {
      background: #fee2e2;
      color: #991b1b;
    }
    .service-charts {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .chart-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .chart-title {
      font-size: 11px;
      font-weight: 500;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .chart-row svg {
      width: 100%;
      height: auto;
    }
    .section {
      margin-top: 32px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 12px;
    }
    .incident {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 10px;
      border-left: 3px solid #ef4444;
    }
    .incident.resolved {
      border-left-color: #22c55e;
    }
    .incident-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .incident-name {
      font-weight: 600;
      font-size: 14px;
    }
    .incident-badge {
      font-size: 11px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 10px;
    }
    .incident-badge.ongoing {
      background: #fee2e2;
      color: #991b1b;
    }
    .incident-badge.resolved {
      background: #dcfce7;
      color: #166534;
    }
    .incident-message {
      font-size: 13px;
      color: #64748b;
      margin-bottom: 6px;
    }
    .incident-time {
      font-size: 11px;
      color: #94a3b8;
    }
    .footer {
      text-align: center;
      padding: 24px;
      font-size: 12px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(statusData.title)}</h1>
    <div class="overall-badge ${allUp ? 'up' : 'down'}">
      <span class="dot"></span>
      ${hasServices ? (allUp ? 'All Systems Operational' : 'Degraded Performance') : 'No services configured'}
    </div>
  </div>
  <div class="container">
    ${servicesHtml}
    ${incidentsHtml}
  </div>
  <div class="footer">
    Last updated ${statusData.lastUpdate ? formatTime(statusData.lastUpdate) : 'never'}
  </div>
</body>
</html>`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
