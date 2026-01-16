const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(process.cwd(), 'data', 'emailalies.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log('Initializing EmailAlies database...');

// The database initialization is handled by the DatabaseManager class
// This script just ensures the database file can be created
try {
  const db = new Database(dbPath);
  db.close();
  console.log('✅ Database initialized successfully at:', dbPath);
  console.log('📁 Database location:', path.resolve(dbPath));
} catch (error) {
  console.error('❌ Failed to initialize database:', error.message);
  process.exit(1);
}