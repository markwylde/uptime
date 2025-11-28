import { loadEnv } from './src/envloader.ts';
import { initLogger } from './src/logger.ts';
import { loadConfig, getConfig, onConfigChange, type Config, type UrlConfig } from './src/config.ts';
import { checkUrl } from './src/checker.ts';
import { notifyDown, notifyUp, notifySslExpiring } from './src/notify.ts';
import { initStore, recordCheck } from './src/store.ts';
import type { CheckResult } from './src/types.ts';
import {
  startStatusServer,
  updateStatus,
  addIncident,
  resolveIncident,
  setRetentionHours,
} from './src/status-page.ts';

interface UrlState {
  status: 'up' | 'down';
  lastCheck: string;
  responseTime: number | null;
  error: string | null;
  sslInfo: any;
  category?: string;
  name: string;
}

interface State {
  urlStates: Map<string, UrlState>;
  timers: Map<string, NodeJS.Timeout>;
  lastAlert: Map<string, number>;
}

const state: State = {
  urlStates: new Map(),
  timers: new Map(),
  lastAlert: new Map(),
};

const SSL_WARNING_DAYS = 14;

async function checkWithRetry(urlConfig: UrlConfig, config: Config): Promise<CheckResult> {
  const alerts = config.alerts || {};
  const retryCount = alerts.retry_count || 3;
  const retryDelay = (alerts.retry_delay || 10) * 1000;

  let result: CheckResult;
  let attempts = 0;

  while (attempts < retryCount) {
    result = await checkUrl(urlConfig, config.settings || {});

    if (result.success) {
      return result;
    }

    attempts++;
    if (attempts < retryCount) {
      await sleep(retryDelay);
    }
  }

  return result!;
}

async function runCheck(urlConfig: UrlConfig): Promise<void> {
  const config = getConfig();
  if (!config) return;

  const name = urlConfig.name;
  const prevState = state.urlStates.get(name);
  const result = await checkWithRetry(urlConfig, config);

  // Record the check result for historical data
  recordCheck(name, result);

  const currentStatus: 'up' | 'down' = result.success ? 'up' : 'down';
  state.urlStates.set(name, {
    status: currentStatus,
    lastCheck: result.timestamp,
    responseTime: result.responseTime,
    error: result.error,
    sslInfo: result.sslInfo,
    category: urlConfig.category,
    name: urlConfig.name,
  });

  const emails = config.notifications?.email || [];
  const alerts = config.alerts || {};
  const cooldown = (alerts.cooldown_period || 300) * 1000;

  if (!result.success && prevState?.status !== 'down') {
    const lastAlertTime = state.lastAlert.get(name) || 0;
    if (Date.now() - lastAlertTime > cooldown) {
      console.log(`[monitor] ${name} is DOWN: ${result.error}`);
      await notifyDown(urlConfig, result, emails);
      addIncident(name, result.error!, result.timestamp);
      state.lastAlert.set(name, Date.now());
    }
  } else if (result.success && prevState?.status === 'down') {
    if (alerts.alert_on_recovery !== false) {
      console.log(`[monitor] ${name} has RECOVERED`);
      await notifyUp(urlConfig, result, emails);
      resolveIncident(name);
    }
  } else if (result.success) {
    console.log(`[monitor] ${name} OK (${result.responseTime}ms)`);
  }

  if (result.sslInfo && result.sslInfo.daysRemaining <= SSL_WARNING_DAYS) {
    const sslAlertKey = `ssl-${name}`;
    const lastSslAlert = state.lastAlert.get(sslAlertKey) || 0;
    const sslCooldown = 24 * 60 * 60 * 1000;

    if (Date.now() - lastSslAlert > sslCooldown) {
      console.log(
        `[monitor] ${name} SSL certificate expires in ${result.sslInfo.daysRemaining} days`
      );
      await notifySslExpiring(urlConfig, result.sslInfo, emails);
      state.lastAlert.set(sslAlertKey, Date.now());
    }
  }

  updateStatusPage();
}

function updateStatusPage(): void {
  const config = getConfig();

  // Preserve config order by iterating through config URLs
  const services: UrlState[] = [];
  if (config?.urls) {
    for (const urlConfig of config.urls) {
      const svcState = state.urlStates.get(urlConfig.name);
      if (svcState) {
        services.push(svcState);
      }
    }
  }

  updateStatus(services, config!);
}

function scheduleChecks(): void {
  for (const timer of state.timers.values()) {
    clearInterval(timer);
  }
  state.timers.clear();

  const config = getConfig();
  if (!config?.urls) return;

  for (const urlConfig of config.urls) {
    const delay = (urlConfig.delay || 60) * 1000;

    runCheck(urlConfig);

    const timer = setInterval(() => runCheck(urlConfig), delay);
    state.timers.set(urlConfig.name, timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function main(): void {
  // Load environment variables from .env file if it exists
  loadEnv();

  // Initialize logger (must be after loadEnv to read NODE_LOG_FILE from .env)
  initLogger();

  const configPath = process.argv[2] || 'config.yaml';

  console.log('[uptime] Starting uptime monitor...');
  loadConfig(configPath);

  const config = getConfig();

  // Initialize data store with retention period
  const retentionDays = config?.storage?.retention_days || 5;
  const dataPath = config?.storage?.path || './data.json';
  initStore(dataPath, retentionDays);
  setRetentionHours(retentionDays * 24);

  if (config?.status_page?.enabled) {
    const port = process.env.STATUS_PORT || 3070;
    startStatusServer(port);
  }

  scheduleChecks();

  onConfigChange((newConfig: Config) => {
    console.log('[uptime] Configuration changed, rescheduling checks...');

    // Update retention settings if changed
    const newRetentionDays = newConfig?.storage?.retention_days || 5;
    setRetentionHours(newRetentionDays * 24);

    scheduleChecks();
  });
}

main();
