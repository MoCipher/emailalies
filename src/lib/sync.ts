import { getDatabase } from '@/database/db';
import { ClientEncryption } from './encryption';
import { SyncData } from '@/database/schema';

export class SyncService {
  private db = getDatabase();

  /**
   * Register a new device for the user
   */
  async registerDevice(userId: string, deviceName: string): Promise<string> {
    const deviceId = crypto.randomUUID();
    const deviceKey = await ClientEncryption.generateKey();
    const exportedDeviceKey = await ClientEncryption.exportKey(deviceKey);

    this.db.createDevice({
      id: deviceId,
      userId,
      deviceName,
      deviceKey: exportedDeviceKey,
    });

    return deviceId;
  }

  /**
   * Synchronize data between devices
   */
  async syncDevice(
    userId: string,
    deviceId: string,
    userMasterKey: CryptoKey,
    lastSyncTimestamp?: Date
  ): Promise<{
    aliases: any[];
    syncTimestamp: Date;
  }> {
    const syncTimestamp = new Date();

    // Get all changes since last sync
    const changes = this.db.getSyncDataAfterTimestamp(
      userId,
      lastSyncTimestamp || new Date(0)
    );

    // Process changes and apply to local state
    const aliases = this.db.getAliasesByUserId(userId);

    // Mark device as synced
    this.db.updateDeviceLastSync(deviceId);

    return {
      aliases,
      syncTimestamp,
    };
  }

  /**
   * Record a data change for synchronization
   */
  async recordChange(
    userId: string,
    deviceId: string,
    dataType: 'alias' | 'email',
    dataId: string,
    operation: 'create' | 'update' | 'delete',
    data?: any,
    encryptionKey?: CryptoKey
  ): Promise<void> {
    let encryptedData = '';

    if (data && encryptionKey) {
      const dataString = JSON.stringify(data);
      encryptedData = await ClientEncryption.encrypt(dataString, encryptionKey);
    }

    this.db.createSyncData({
      id: crypto.randomUUID(),
      userId,
      deviceId,
      dataType,
      dataId,
      encryptedData,
      operation,
    });
  }

  /**
   * Get pending sync data for a device
   */
  getPendingSyncData(userId: string, deviceId: string, since: Date): SyncData[] {
    return this.db.getSyncDataAfterTimestamp(userId, since);
  }

  /**
   * Decrypt sync data
   */
  async decryptSyncData(syncData: SyncData, decryptionKey: CryptoKey): Promise<any> {
    if (!syncData.encryptedData) return null;

    try {
      const decryptedString = await ClientEncryption.decrypt(syncData.encryptedData, decryptionKey);
      return JSON.parse(decryptedString);
    } catch (error) {
      console.error('Failed to decrypt sync data:', error);
      return null;
    }
  }

  /**
   * Clean up old sync data (older than 30 days)
   */
  cleanupOldSyncData(): void {
    // In a real implementation, you'd add a cleanup method to the database
    // For now, this is a placeholder
  }

  /**
   * Get device info
   */
  getDeviceInfo(deviceId: string) {
    const devices = this.db.getDevicesByUserId(''); // This would need userId
    return devices.find(d => d.id === deviceId);
  }

  /**
   * Remove a device
   */
  removeDevice(deviceId: string): void {
    // In a real implementation, you'd delete the device and its sync data
    // For now, this is a placeholder
  }
}

// Singleton instance
let syncServiceInstance: SyncService | null = null;

export function getSyncService(): SyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new SyncService();
  }
  return syncServiceInstance;
}