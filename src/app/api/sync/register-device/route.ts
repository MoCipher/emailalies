import { NextRequest, NextResponse } from 'next/server';
import { getSyncService } from '@/lib/sync';
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

const registerDeviceSchema = z.object({
  deviceName: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { deviceName } = registerDeviceSchema.parse(body);

    const syncService = getSyncService();
    const deviceId = await syncService.registerDevice(user.id, deviceName);

    return NextResponse.json({
      success: true,
      deviceId,
      deviceName,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Register device error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}