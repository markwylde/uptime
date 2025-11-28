import pino from 'pino';
import { createWriteStream } from 'fs';

let logger: pino.Logger;

// Store original console methods
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

export function initLogger() {
  const logFile = process.env.NODE_LOG_FILE;

  // Create the Pino logger instance
  logger = pino(
    {
      level: process.env.NODE_LOG_LEVEL || 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    logFile
      ? // Write to file when NODE_LOG_FILE is set
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

  // Log that we've initialized
  if (logFile) {
    logger.info(`Logger initialized - writing to file: ${logFile}`);
  } else {
    logger.info('Logger initialized - writing to stdout');
  }

  // Intercept console methods and redirect through Pino
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
}

// Export the logger for direct use if needed
export { logger, originalConsole };
