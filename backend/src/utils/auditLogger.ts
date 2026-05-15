import { PrismaClient, Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';

interface AuditEntry {
  userId: string;
  role: string;
  action: string;           
  targetModel: string;      
  targetId: string;
  centerId?: string;
  meta?: Record<string, unknown>;  
}

export async function logAudit(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
  const db = tx || prisma;
  await db.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      tableName: entry.targetModel,
      recordId: entry.targetId,
      newData: entry.meta as Prisma.InputJsonValue,
    }
  });
}
