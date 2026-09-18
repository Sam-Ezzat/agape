/**
 * Auth Controller
 *
 * WHY: HTTP layer for login/logout/me. Issues the httpOnly cookie the rest
 * of the API (and the Socket.io handshake) trusts as proof of identity.
 */

import { Request, Response } from 'express';
import { AuthService } from '@/services/auth.service';
import { AUTH_COOKIE_NAME } from '@/utils/jwt';

const isProduction = process.env.NODE_ENV === 'production';

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export class AuthController {
  constructor(private authService: AuthService) {}

  async login(req: Request, res: Response) {
    const { email, password } = req.body;
    const { token, user } = await this.authService.login(email, password);
    res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);
    res.json({ success: true, data: user });
  }

  async logout(_req: Request, res: Response) {
    res.clearCookie(AUTH_COOKIE_NAME, { httpOnly: true, secure: isProduction, sameSite: cookieOptions.sameSite });
    res.json({ success: true, message: 'Logged out' });
  }

  async me(req: Request, res: Response) {
    const user = await this.authService.getMe(req.user!.id);
    res.json({ success: true, data: user });
  }

  async updateProfile(req: Request, res: Response) {
    const { token, user } = await this.authService.updateProfile(req.user!.id, req.body);
    res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);
    res.json({ success: true, data: user });
  }

  async changePassword(req: Request, res: Response) {
    const { currentPassword, newPassword } = req.body;
    const { token, user } = await this.authService.changePassword(req.user!.id, currentPassword, newPassword);
    res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);
    res.json({ success: true, data: user, message: 'Password changed successfully' });
  }
}
