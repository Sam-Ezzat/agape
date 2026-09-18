/**
 * JWT sign/verify helpers
 *
 * WHY: Single choke point for token shape so auth.service (REST) and the
 * Socket.io handshake middleware stay in sync on what a token contains.
 */

import jwt from 'jsonwebtoken';
import type { AuthenticatedUser } from '@/types/express';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const JWT_EXPIRES_IN = '7d';
export const AUTH_COOKIE_NAME = 'token';

export type TokenPayload = AuthenticatedUser;

export const signToken = (payload: TokenPayload): string =>
  jwt.sign(payload, JWT_SECRET as string, { expiresIn: JWT_EXPIRES_IN });

export const verifyToken = (token: string): TokenPayload =>
  jwt.verify(token, JWT_SECRET as string) as TokenPayload;
