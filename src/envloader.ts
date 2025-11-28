import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Load environment variables from a .env file if it exists
 * @param envPath - Optional path to .env file (defaults to ./.env)
 */
export function loadEnv(envPath: string = '.env'): void {
  const fullPath = join(process.cwd(), envPath);

  if (!existsSync(fullPath)) {
    return;
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      // Skip empty lines and comments
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse KEY=VALUE pairs
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (!match) {
        continue;
      }

      const key = match[1].trim();
      const value = match[2].trim();

      // Don't override existing environment variables
      if (process.env[key] === undefined) {
        // Remove surrounding quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '');
        process.env[key] = cleanValue;
      }
    }

    console.log(`[envloader] Loaded: ${fullPath}`);
  } catch (error) {
    console.warn(`[envloader] Failed to load ${fullPath}:`, error);
  }
}
