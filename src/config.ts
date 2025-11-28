import { readFileSync, watch } from 'node:fs';
import { parseYaml } from './yaml.ts';

export interface UrlConfig {
  name: string;
  category?: string;
  url: string;
  delay?: number;
  method?: string;
  timeout?: number;
  expected_status?: number[];
  expected_content?: string;
  response_time_threshold?: number;
  check_ssl?: boolean;
}

export interface AlertsConfig {
  retry_count?: number;
  retry_delay?: number;
  alert_on_recovery?: boolean;
  cooldown_period?: number;
}

export interface SettingsConfig {
  default_timeout?: number;
  user_agent?: string;
  follow_redirects?: boolean;
  max_redirects?: number;
}

export interface NotificationsConfig {
  email?: string[];
}

export interface StorageConfig {
  path?: string;
  retention_days?: number;
}

export interface StatusPageConfig {
  enabled?: boolean;
  public?: boolean;
  title?: string;
  incident_retention_days?: number;
}

export interface Config {
  settings?: SettingsConfig;
  notifications?: NotificationsConfig;
  alerts?: AlertsConfig;
  urls?: UrlConfig[];
  storage?: StorageConfig;
  status_page?: StatusPageConfig;
}

type ConfigChangeListener = (config: Config) => void;

let config: Config | null = null;
let configPath: string | null = null;
let listeners: ConfigChangeListener[] = [];

export function loadConfig(path: string): void {
  configPath = path;
  reload();

  watch(configPath, (eventType) => {
    if (eventType === 'change') {
      console.log('[config] Detected change, reloading...');
      reload();
    }
  });
}

function reload(): void {
  try {
    if (!configPath) return;
    const content = readFileSync(configPath, 'utf-8');
    config = parseYaml(content) as Config;
    console.log('[config] Loaded configuration');
    notifyListeners();
  } catch (err) {
    console.error('[config] Error loading config:', (err as Error).message);
  }
}

export function getConfig(): Config | null {
  return config;
}

export function onConfigChange(callback: ConfigChangeListener): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter(l => l !== callback);
  };
}

function notifyListeners(): void {
  if (!config) return;
  for (const listener of listeners) {
    try {
      listener(config);
    } catch (err) {
      console.error('[config] Error in listener:', (err as Error).message);
    }
  }
}
