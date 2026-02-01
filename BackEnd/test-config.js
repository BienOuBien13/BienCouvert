/**
 * Shared configuration for test scripts
 * Load database credentials from environment variables
 * 
 * Usage:
 *   const config = require('./test-config');
 *   const pool = new Pool(config.dbConfig);
 */

require('dotenv').config();

const dbConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'assurclair',
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
};

// Validate required environment variables
if (!dbConfig.user || !dbConfig.password) {
  console.error('❌ Error: POSTGRES_USER and POSTGRES_PASSWORD must be set in environment or .env file');
  console.error('   Please create a .env file with the required credentials.');
  process.exit(1);
}

module.exports = {
  dbConfig
};
