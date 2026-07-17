import path from 'path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logDir = path.join(process.cwd(), 'logs');

const lineFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `[${timestamp}] [${String(level).toUpperCase()}] ${message}`;
});

const fileTransport = new DailyRotateFile({
  dirname: logDir,
  filename: 'agent-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxFiles: '14d',
  zippedArchive: true,
});

const winstonLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), lineFormat),
  transports: [
    fileTransport,
    new winston.transports.Console(),
  ],
});

export const logger = {
  info: (msg: string) => winstonLogger.info(msg),
  warn: (msg: string) => winstonLogger.warn(msg),
  error: (msg: string) => winstonLogger.error(msg),
};
