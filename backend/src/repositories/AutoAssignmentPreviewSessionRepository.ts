// WHY: Repository for the shared, backend-persisted auto-assignment preview
// draft. One active session per conference house — multiple admins read/
// write the same row, so edits use an optimistic-concurrency version check.

import { AutoAssignmentPreviewSession, Prisma, PrismaClient } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export interface CreatePreviewSessionDTO {
  organizationId: string;
  conferenceHouseId: string;
  buildingIds: string[];
  data: Prisma.InputJsonValue;
  createdById: string;
}

export class AutoAssignmentPreviewSessionRepository extends BaseRepository<
  AutoAssignmentPreviewSession,
  Prisma.AutoAssignmentPreviewSessionDelegate
> {
  constructor(prisma: PrismaClient) {
    super(prisma, prisma.autoAssignmentPreviewSession);
  }

  async findByHouse(
    conferenceHouseId: string,
    organizationId: string
  ): Promise<AutoAssignmentPreviewSession | null> {
    return this.prisma.autoAssignmentPreviewSession.findFirst({
      where: { conferenceHouseId, organizationId },
    });
  }

  async findSessionById(
    id: string,
    organizationId: string
  ): Promise<AutoAssignmentPreviewSession | null> {
    return this.prisma.autoAssignmentPreviewSession.findFirst({
      where: { id, organizationId },
    });
  }

  async createSession(data: CreatePreviewSessionDTO): Promise<AutoAssignmentPreviewSession> {
    return this.prisma.autoAssignmentPreviewSession.create({
      data: {
        organizationId: data.organizationId,
        conferenceHouseId: data.conferenceHouseId,
        buildingIds: data.buildingIds,
        data: data.data,
        createdById: data.createdById,
      },
    });
  }

  /**
   * Optimistic-concurrency update: only succeeds if `expectedVersion`
   * still matches the stored version. Returns null on conflict so the
   * caller can distinguish "not found" from "someone else edited first"
   * without an extra round-trip.
   */
  async updateDataIfVersionMatches(
    id: string,
    organizationId: string,
    expectedVersion: number,
    newData: Prisma.InputJsonValue
  ): Promise<AutoAssignmentPreviewSession | null> {
    const result = await this.prisma.autoAssignmentPreviewSession.updateMany({
      where: { id, organizationId, version: expectedVersion },
      data: { data: newData, version: { increment: 1 } },
    });

    if (result.count === 0) {
      return null;
    }

    return this.prisma.autoAssignmentPreviewSession.findFirst({ where: { id, organizationId } });
  }

  async deleteSession(id: string, organizationId: string): Promise<void> {
    await this.prisma.autoAssignmentPreviewSession.deleteMany({
      where: { id, organizationId },
    });
  }
}
