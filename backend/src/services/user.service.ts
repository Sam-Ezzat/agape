/**
 * User Service
 *
 * WHY: Org-scoped user management (admin-only) — list/add/change-role/remove
 * teammates within the caller's organization.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Prisma, UserRole } from '@prisma/client';
import prisma from '@/utils/prisma-client';
import { AppError } from '@/middleware/errorHandler';
import type { CreateUserDTO } from '@/validators/user.schemas';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export class UserService {
  async list(organizationId: string) {
    return prisma.user.findMany({
      where: { organizationId },
      select: USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(organizationId: string, data: CreateUserDTO) {
    const temporaryPassword = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, 'x');
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    let user;
    try {
      user = await prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          role: data.role,
          organizationId,
          passwordHash,
        },
        select: USER_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'Email already in use');
      }
      throw error;
    }

    return { user, temporaryPassword };
  }

  async updateRole(organizationId: string, targetUserId: string, role: UserRole) {
    const target = await prisma.user.findFirst({ where: { id: targetUserId, organizationId } });
    if (!target) {
      throw new AppError(404, 'User not found in organization');
    }

    if (target.role === UserRole.ADMIN && role !== UserRole.ADMIN) {
      await this.assertNotLastAdmin(organizationId, targetUserId);
    }

    return prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: USER_SELECT,
    });
  }

  async remove(organizationId: string, targetUserId: string, requestingUserId: string) {
    if (targetUserId === requestingUserId) {
      throw new AppError(400, "Can't remove your own account");
    }

    const target = await prisma.user.findFirst({ where: { id: targetUserId, organizationId } });
    if (!target) {
      throw new AppError(404, 'User not found in organization');
    }

    if (target.role === UserRole.ADMIN) {
      await this.assertNotLastAdmin(organizationId, targetUserId);
    }

    await prisma.user.delete({ where: { id: targetUserId } });
  }

  /**
   * Throws if removing/demoting `excludingUserId` would leave the
   * organization with zero admins.
   */
  private async assertNotLastAdmin(organizationId: string, excludingUserId: string): Promise<void> {
    const remainingAdmins = await prisma.user.count({
      where: { organizationId, role: UserRole.ADMIN, id: { not: excludingUserId } },
    });
    if (remainingAdmins === 0) {
      throw new AppError(400, 'Organization must have at least one admin');
    }
  }
}
