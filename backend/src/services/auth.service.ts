/**
 * Auth Service
 *
 * WHY: Verifies credentials and issues the JWT used by both REST auth
 * middleware and the Socket.io handshake middleware.
 */

import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import prisma from '@/utils/prisma-client';
import { AppError } from '@/middleware/errorHandler';
import { signToken } from '@/utils/jwt';
import type { AuthenticatedUser } from '@/types/express';
import type { UpdateProfileDTO } from '@/validators/user.schemas';

export class AuthService {
  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError(401, 'Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new AppError(401, 'Invalid email or password');
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
    };

    return { token: signToken(authenticatedUser), user: await this.getMe(user.id) };
  }

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, organizationId: true, organization: { select: { id: true, name: true } } },
    });
    if (!user) {
      throw new AppError(401, 'Unauthorized');
    }
    return user;
  }

  /**
   * Update the caller's own name/email and reissue the token so the
   * session cookie reflects the change immediately.
   */
  async updateProfile(userId: string, data: UpdateProfileDTO) {
    let user;
    try {
      user = await prisma.user.update({ where: { id: userId }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'Email already in use');
      }
      throw error;
    }

    const token = signToken({ id: user.id, organizationId: user.organizationId, role: user.role, email: user.email });
    return { token, user: await this.getMe(userId) };
  }

  /**
   * Change the caller's own password, verifying the current one first.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(401, 'Unauthorized');
    }

    const passwordMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordMatches) {
      throw new AppError(401, 'Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    const token = signToken({ id: user.id, organizationId: user.organizationId, role: user.role, email: user.email });
    return { token, user: await this.getMe(userId) };
  }
}
