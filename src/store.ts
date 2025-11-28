import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { CheckResult, StoredCheck } from './types.ts';

export type { StoredCheck };

interface StoreData {
  checks: Record<string, StoredCheck[]>;
}

interface HourlyAverage {
  hour: string;
  avgResponseTime: number | null;
  uptime: number | null;
  checkCount: number;
}

let dataPath = './data.json';
let data: StoreData = { checks: {} };
let retentionDays = 5;

export function initStore(path = './data.json', retention = 5): void {
  dataPath = path;
  retentionDays = retention;
  load();
}

function load(): void {
  try {
    if (existsSync(dataPath)) {
      const content = readFileSync(dataPath, 'utf-8');
      data = JSON.parse(content);
      if (!data.checks) data.checks = {};
    }
  } catch (err) {
    console.error('[store] Error loading data:', (err as Error).message);
    data = { checks: {} };
  }
}

function save(): void {
  try {
    writeFileSync(dataPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[store] Error saving data:', (err as Error).message);
  }
}

export function recordCheck(name: string, result: CheckResult): void {
  if (!data.checks[name]) {
    data.checks[name] = [];
  }

  data.checks[name].push({
    timestamp: result.timestamp,
    success: result.success,
    responseTime: result.responseTime,
    statusCode: result.statusCode,
    error: result.error,
  });

  prune();
  save();
}

function prune(): void {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  for (const name of Object.keys(data.checks)) {
    data.checks[name] = data.checks[name].filter(
      (check) => new Date(check.timestamp).getTime() > cutoff
    );

    if (data.checks[name].length === 0) {
      delete data.checks[name];
    }
  }
}

export function getChecks(name: string): StoredCheck[] {
  return data.checks[name] || [];
}

export function getAllChecks(): Record<string, StoredCheck[]> {
  return data.checks;
}

export function getRecentChecks(name: string, limit = 50): StoredCheck[] {
  const checks = getChecks(name);
  return checks.slice(-limit);
}

export function getHourlyAverages(name: string, hours = 120): HourlyAverage[] {
  const checks = getChecks(name);
  if (checks.length === 0) return [];

  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const buckets = new Map<number, { total: number; count: number; upCount: number }>();

  // Initialize buckets for the last N hours
  for (let i = 0; i < hours; i++) {
    const hourStart = Math.floor((now - i * hourMs) / hourMs) * hourMs;
    buckets.set(hourStart, { total: 0, count: 0, upCount: 0 });
  }

  // Fill buckets with data
  for (const check of checks) {
    const ts = new Date(check.timestamp).getTime();
    const hourStart = Math.floor(ts / hourMs) * hourMs;

    if (buckets.has(hourStart)) {
      const bucket = buckets.get(hourStart)!;
      if (check.responseTime != null) {
        bucket.total += check.responseTime;
        bucket.count++;
      }
      if (check.success) {
        bucket.upCount++;
      }
    }
  }

  // Convert to array sorted by time
  const result: HourlyAverage[] = [];
  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a - b);

  for (const hourStart of sortedKeys) {
    const bucket = buckets.get(hourStart)!;
    result.push({
      hour: new Date(hourStart).toISOString(),
      avgResponseTime: bucket.count > 0 ? Math.round(bucket.total / bucket.count) : null,
      uptime: bucket.count > 0 ? Math.round((bucket.upCount / bucket.count) * 100) : null,
      checkCount: bucket.count,
    });
  }

  return result;
}
