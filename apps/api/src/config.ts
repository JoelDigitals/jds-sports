export const config = {
  port: Number(process.env.API_PORT ?? 8787),
  jwtSecret: process.env.JWT_SECRET ?? 'jds-sports-dev-secret-change-me',
  dbPath: process.env.DB_PATH ?? 'data/jds.db',
  receiptsDir: 'data/receipts',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
};

export const SEASON_DEFAULT = '2026/27';
export const ASSOCIATION_DEFAULT = 'HVS';
