import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { User, EmailAlias, Email, Device, SyncData } from './schema';

export class DatabaseManager {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'emailalies.db');

    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.initializeTables();
  }

  private initializeTables(): void {
    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        encryption_key TEXT NOT NULL,
        master_key_salt TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: Add master_key_salt column if it doesn't exist (for existing databases)
    try {
      this.db.exec(`ALTER TABLE users ADD COLUMN master_key_salt TEXT;`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    // Email aliases table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS email_aliases (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        alias TEXT UNIQUE NOT NULL,
        description TEXT,
        forwarding_email TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Emails table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY,
        alias_id TEXT NOT NULL,
        from_email TEXT NOT NULL,
        to_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        content TEXT NOT NULL,
        is_read BOOLEAN DEFAULT 0,
        received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (alias_id) REFERENCES email_aliases (id)
      )
    `);

    // Devices table for cross-device sync
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_name TEXT NOT NULL,
        device_key TEXT NOT NULL,
        last_sync DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Sync data table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_data (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        data_type TEXT NOT NULL,
        data_id TEXT NOT NULL,
        encrypted_data TEXT NOT NULL,
        operation TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (device_id) REFERENCES devices (id)
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_email_aliases_user_id ON email_aliases(user_id);
      CREATE INDEX IF NOT EXISTS idx_emails_alias_id ON emails(alias_id);
      CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
      CREATE INDEX IF NOT EXISTS idx_sync_data_user_id ON sync_data(user_id);
    `);
  }

  // User operations
  createUser(user: Omit<User, 'createdAt' | 'updatedAt'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, email, encryption_key, master_key_salt)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(user.id, user.email, user.encryptionKey, user.masterKeySalt);
  }

  getUserByEmail(email: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    const row = stmt.get(email) as any;
    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      encryptionKey: row.encryption_key,
      masterKeySalt: row.master_key_salt,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  getUserById(id: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      encryptionKey: row.encryption_key,
      masterKeySalt: row.master_key_salt,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // Email alias operations
  createAlias(alias: Omit<EmailAlias, 'createdAt' | 'updatedAt'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO email_aliases (id, user_id, alias, description, forwarding_email, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      alias.id,
      alias.userId,
      alias.alias,
      alias.description,
      alias.forwardingEmail,
      alias.isActive ? 1 : 0
    );
  }

  getAliasesByUserId(userId: string): EmailAlias[] {
    const stmt = this.db.prepare('SELECT * FROM email_aliases WHERE user_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(userId) as any[];

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      alias: row.alias,
      description: row.description,
      forwardingEmail: row.forwarding_email,
      isActive: row.is_active === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  updateAlias(id: string, updates: Partial<Pick<EmailAlias, 'description' | 'isActive'>>): void {
    const stmt = this.db.prepare(`
      UPDATE email_aliases
      SET description = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(updates.description, updates.isActive ? 1 : 0, id);
  }

  deleteAlias(id: string): void {
    // Delete associated emails first
    this.db.prepare('DELETE FROM emails WHERE alias_id = ?').run(id);
    // Then delete the alias
    this.db.prepare('DELETE FROM email_aliases WHERE id = ?').run(id);
  }

  // Email operations
  createEmail(email: Omit<Email, 'receivedAt'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO emails (id, alias_id, from_email, to_email, subject, content)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      email.id,
      email.aliasId,
      email.from,
      email.to,
      email.subject,
      email.content
    );
  }

  getEmailsByAliasId(aliasId: string): Email[] {
    const stmt = this.db.prepare('SELECT * FROM emails WHERE alias_id = ? ORDER BY received_at DESC');
    const rows = stmt.all(aliasId) as any[];

    return rows.map(row => ({
      id: row.id,
      aliasId: row.alias_id,
      from: row.from_email,
      to: row.to_email,
      subject: row.subject,
      content: row.content,
      isRead: row.is_read === 1,
      receivedAt: new Date(row.received_at),
    }));
  }

  markEmailAsRead(id: string): void {
    const stmt = this.db.prepare('UPDATE emails SET is_read = 1 WHERE id = ?');
    stmt.run(id);
  }

  // Device operations for cross-device sync
  createDevice(device: Omit<Device, 'createdAt' | 'lastSync'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO devices (id, user_id, device_name, device_key)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(device.id, device.userId, device.deviceName, device.deviceKey);
  }

  getDevicesByUserId(userId: string): Device[] {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(userId) as any[];

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      deviceName: row.device_name,
      deviceKey: row.device_key,
      lastSync: new Date(row.last_sync),
      createdAt: new Date(row.created_at),
    }));
  }

  updateDeviceLastSync(deviceId: string): void {
    const stmt = this.db.prepare('UPDATE devices SET last_sync = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(deviceId);
  }

  // Sync operations
  createSyncData(syncData: Omit<SyncData, 'timestamp'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO sync_data (id, user_id, device_id, data_type, data_id, encrypted_data, operation)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      syncData.id,
      syncData.userId,
      syncData.deviceId,
      syncData.dataType,
      syncData.dataId,
      syncData.encryptedData,
      syncData.operation
    );
  }

  getSyncDataAfterTimestamp(userId: string, timestamp: Date): SyncData[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sync_data
      WHERE user_id = ? AND timestamp > ?
      ORDER BY timestamp ASC
    `);
    const rows = stmt.all(userId, timestamp.toISOString()) as any[];

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      deviceId: row.device_id,
      dataType: row.data_type,
      dataId: row.data_id,
      encryptedData: row.encrypted_data,
      operation: row.operation,
      timestamp: new Date(row.timestamp),
    }));
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance
let dbInstance: DatabaseManager | null = null;

export function getDatabase(): DatabaseManager {
  if (!dbInstance) {
    dbInstance = new DatabaseManager();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}