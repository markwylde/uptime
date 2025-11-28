import pino from 'pino';
import { createWriteStream } from 'fs';

const logFile = process.env.LOG_FILE;

// Create the Pino logger instance
const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  logFile
    ? // Write to file when LOG_FILE is set
      createWriteStream(logFile, { flags: 'a' })
    : // Use pretty printing for stdout when no file is set
      pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      })
);

// Intercept console methods and redirect through Pino
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

console.log = (...args: any[]) => {
  logger.info(args.join(' '));
};

console.info = (...args: any[]) => {
  logger.info(args.join(' '));
};

console.warn = (...args: any[]) => {
  logger.warn(args.join(' '));
};

console.error = (...args: any[]) => {
  logger.error(args.join(' '));
};

console.debug = (...args: any[]) => {
  logger.debug(args.join(' '));
};

// Export the logger for direct use if needed
export { logger, originalConsole };
