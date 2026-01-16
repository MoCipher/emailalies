import { NextRequest, NextResponse } from 'next/server';
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

const updateAliasSchema = z.object({
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const body = await request.json();
    const updates = updateAliasSchema.parse(body);

    const db = getDatabase();
    const aliases = db.getAliasesByUserId(user.id);
    const alias = aliases.find(a => a.id === resolvedParams.id);

    if (!alias) {
      return NextResponse.json({ error: 'Alias not found' }, { status: 404 });
    }

    db.updateAlias(resolvedParams.id, updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Update alias error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const db = getDatabase();
    const aliases = db.getAliasesByUserId(user.id);
    const alias = aliases.find(a => a.id === resolvedParams.id);

    if (!alias) {
      return NextResponse.json({ error: 'Alias not found' }, { status: 404 });
    }

    db.deleteAlias(resolvedParams.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete alias error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}