/**
 * Express Request augmentation
 *
 * WHY: `authenticate` middleware attaches the JWT payload to `req.user` so
 * every controller/service downstream can scope queries by organization.
 */

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  role: 'ADMIN' | 'MEMBER';
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
