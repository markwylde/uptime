import type { StoredCheck } from './types.ts';

interface ResponseTimeChartOptions {
  width?: number;
  height?: number;
  lineColor?: string;
  dotColor?: string;
  bgColor?: string;
  textColor?: string;
  labelColor?: string;
  gapThresholdMs?: number; // Time gap in ms to consider as a break in data
}

interface UptimeChartOptions {
  width?: number;
  height?: number;
  upColor?: string;
  downColor?: string;
  bgColor?: string;
  textColor?: string;
}

export function generateResponseTimeChart(checks: StoredCheck[], options: ResponseTimeChartOptions = {}): string {
  const {
    width = 600,
    height = 70,
    lineColor = '#3b82f6',
    dotColor = '#2563eb',
    bgColor = '#f8fafc',
    textColor = '#64748b',
    labelColor = '#94a3b8',
    gapThresholdMs = 5 * 60 * 1000, // Default: 5 minutes
  } = options;

  // Filter to checks with response times
  const points = checks.filter((c) => c.responseTime != null);

  if (points.length === 0) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="${bgColor}" rx="8"/>
      <text x="${width / 2}" y="${height / 2 + 4}" text-anchor="middle" fill="${textColor}" font-family="system-ui, sans-serif" font-size="12">Collecting data...</text>
    </svg>`;
  }

  const pad = { top: 12, right: 55, bottom: 12, left: 40 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const vals = points.map((p) => p.responseTime!);
  const maxVal = Math.max(...vals);
  const minVal = Math.min(...vals);
  const avgVal = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  const latest = vals[vals.length - 1];

  // Add padding to scale
  const scaleMax = maxVal * 1.1 || 100;
  const scaleMin = 0;

  // Time-based x-axis scaling
  const timestamps = points.map((p) => new Date(p.timestamp).getTime());
  const minTime = timestamps[0];
  const maxTime = timestamps[timestamps.length - 1];
  const timeRange = maxTime - minTime || 1; // Avoid division by zero

  const xScale = (timestamp: number) => pad.left + ((timestamp - minTime) / timeRange) * w;
  const yScale = (v: number) => pad.top + h - ((v - scaleMin) / (scaleMax - scaleMin)) * h;

  // Build line path with gap detection
  const pathSegments: string[] = [];
  let currentSegment: string[] = [];

  for (let i = 0; i < points.length; i++) {
    const timestamp = timestamps[i];
    const x = xScale(timestamp);
    const y = yScale(points[i].responseTime!);

    // Check for gap with previous point
    if (i > 0) {
      const gap = timestamp - timestamps[i - 1];

      if (gap > gapThresholdMs) {
        // Gap detected - save current segment and start new one
        if (currentSegment.length > 0) {
          pathSegments.push(currentSegment.join(' '));
        }
        currentSegment = [`M ${x} ${y}`];
      } else {
        currentSegment.push(`L ${x} ${y}`);
      }
    } else {
      currentSegment.push(`M ${x} ${y}`);
    }
  }

  // Add final segment
  if (currentSegment.length > 0) {
    pathSegments.push(currentSegment.join(' '));
  }

  const path = pathSegments.join(' ');

  // Build area paths for each segment (for the gradient fill under each line segment)
  const areaSegments: string[] = [];
  let segmentStartIdx = 0;

  for (let i = 0; i < points.length; i++) {
    const isLastPoint = i === points.length - 1;
    let isGap = false;

    if (i > 0) {
      isGap = timestamps[i] - timestamps[i - 1] > gapThresholdMs;
    }

    if (isGap || isLastPoint) {
      // End of segment - create area path
      const endIdx = isGap ? i - 1 : i;
      if (endIdx >= segmentStartIdx) {
        let areaPath = '';
        for (let j = segmentStartIdx; j <= endIdx; j++) {
          const x = xScale(timestamps[j]);
          const y = yScale(points[j].responseTime!);
          areaPath += j === segmentStartIdx ? `M ${x} ${y}` : ` L ${x} ${y}`;
        }
        areaPath += ` L ${xScale(timestamps[endIdx])} ${pad.top + h} L ${xScale(timestamps[segmentStartIdx])} ${pad.top + h} Z`;
        areaSegments.push(areaPath);
      }
      segmentStartIdx = i;
    }
  }

  const area = areaSegments.join(' ');

  // Y-axis labels
  const maxY = yScale(maxVal);
  const minY = yScale(minVal);
  const avgY = yScale(avgVal);

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fill" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="${bgColor}" rx="8"/>

    <!-- Grid lines -->
    <line x1="${pad.left}" y1="${maxY}" x2="${pad.left + w}" y2="${maxY}" stroke="#e2e8f0" stroke-dasharray="3,3"/>
    <line x1="${pad.left}" y1="${minY}" x2="${pad.left + w}" y2="${minY}" stroke="#e2e8f0" stroke-dasharray="3,3"/>
    <line x1="${pad.left}" y1="${avgY}" x2="${pad.left + w}" y2="${avgY}" stroke="#cbd5e1" stroke-dasharray="3,3"/>

    <!-- Y-axis labels -->
    <text x="${pad.left - 6}" y="${maxY + 3}" text-anchor="end" fill="${labelColor}" font-family="system-ui, sans-serif" font-size="9">${maxVal}</text>
    <text x="${pad.left - 6}" y="${minY + 3}" text-anchor="end" fill="${labelColor}" font-family="system-ui, sans-serif" font-size="9">${minVal}</text>
    <text x="${pad.left - 6}" y="${avgY + 3}" text-anchor="end" fill="#64748b" font-family="system-ui, sans-serif" font-size="9" font-weight="500">~${avgVal}</text>

    <path d="${area}" fill="url(#fill)"/>
    <path d="${path}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${xScale(timestamps[timestamps.length - 1])}" cy="${yScale(latest)}" r="4" fill="${dotColor}"/>

    <!-- Latest value -->
    <text x="${width - 6}" y="${height / 2 + 4}" text-anchor="end" fill="${textColor}" font-family="system-ui, sans-serif" font-size="12" font-weight="600">${latest}ms</text>
  </svg>`;
}

export function generateUptimeChart(checks: StoredCheck[], options: UptimeChartOptions = {}): string {
  const {
    width = 600,
    height = 24,
    upColor = '#22c55e',
    downColor = '#ef4444',
    bgColor = '#f8fafc',
    textColor = '#64748b',
  } = options;

  if (checks.length === 0) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="${bgColor}" rx="6"/>
      <text x="${width / 2}" y="${height / 2 + 4}" text-anchor="middle" fill="${textColor}" font-family="system-ui, sans-serif" font-size="11">No data</text>
    </svg>`;
  }

  const pad = { left: 45, right: 8, top: 3, bottom: 3 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  // Show last 50 checks max
  const recent = checks.slice(-50);
  const gap = 2;
  const barW = Math.max(4, (w - gap * (recent.length - 1)) / recent.length);

  const bars = recent.map((c, i) => {
    const x = pad.left + i * (barW + gap);
    const color = c.success ? upColor : downColor;
    return `<rect x="${x}" y="${pad.top}" width="${barW}" height="${h}" fill="${color}" rx="2"/>`;
  }).join('');

  // Calculate uptime %
  const up = checks.filter((c) => c.success).length;
  const pct = Math.round((up / checks.length) * 100);
  const pctColor = pct === 100 ? upColor : pct >= 95 ? '#f59e0b' : downColor;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${bgColor}" rx="6"/>
    <text x="${pad.left - 8}" y="${height / 2 + 4}" text-anchor="end" fill="${pctColor}" font-family="system-ui, sans-serif" font-size="11" font-weight="600">${pct}%</text>
    ${bars}
  </svg>`;
}
