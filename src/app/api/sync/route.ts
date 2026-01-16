import { NextRequest, NextResponse } from 'next/server';
import { getSyncService } from '@/lib/sync';
import { MasterKeyManager } from '@/lib/encryption';
import { getDatabase } from '@/database/db';
import { z } from 'zod';

// Middleware to check authentication (simplified)
async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return null;
  }

  const userId = authHeader.replace('Bearer ', '');
  const db = getDatabase();
  return db.getUserById(userId);
}

const syncSchema = z.object({
  deviceId: z.string(),
  lastSyncTimestamp: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { deviceId, lastSyncTimestamp } = syncSchema.parse(body);

    const syncService = getSyncService();
    const db = getDatabase();

    // Verify device belongs to user
    const devices = db.getDevicesByUserId(user.id);
    const device = devices.find(d => d.id === deviceId);

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // Get user's master encryption key from database
    const masterKey = await MasterKeyManager.decryptMasterKey(
      user.encryptionKey,
      user.masterKeySalt
    );

    const lastSync = lastSyncTimestamp ? new Date(lastSyncTimestamp) : undefined;

    const syncResult = await syncService.syncDevice(
      user.id,
      deviceId,
      masterKey,
      lastSync
    );

    return NextResponse.json({
      success: true,
      aliases: syncResult.aliases,
      syncTimestamp: syncResult.syncTimestamp.toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const syncService = getSyncService();
    const db = getDatabase();

    const devices = db.getDevicesByUserId(user.id);

    return NextResponse.json({ devices });
  } catch (error) {
    console.error('Get devices error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}