export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'pet-memorial-dev-secret',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3307', 10),
    username: process.env.DB_USER || 'pet',
    password: process.env.DB_PASS || 'pet123456',
    database: process.env.DB_NAME || 'pet_memorial',
  },
};
