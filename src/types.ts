// Shared type definitions

export interface SslInfo {
  valid: boolean;
  validFrom: string;
  validTo: string;
  issuer?: string;
  subject?: string;
  daysRemaining: number;
}

export interface CheckResult {
  name: string;
  url: string;
  success: boolean;
  statusCode: number | null;
  responseTime: number | null;
  error: string | null;
  sslInfo: SslInfo | null;
  timestamp: string;
}

export interface StoredCheck {
  timestamp: string;
  success: boolean;
  responseTime: number | null;
  statusCode: number | null;
  error: string | null;
}
