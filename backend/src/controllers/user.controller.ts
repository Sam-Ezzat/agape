/**
 * User Controller
 *
 * WHY: HTTP layer for org user management. Gated admin-only by
 * `requireRole('ADMIN')` in user.routes.ts.
 */

import { Request, Response } from 'express';
import { UserService } from '@/services/user.service';

export class UserController {
  constructor(private userService: UserService) {}

  async list(req: Request, res: Response) {
    const users = await this.userService.list(req.user!.organizationId);
    res.json({ success: true, data: users });
  }

  async create(req: Request, res: Response) {
    const { user, temporaryPassword } = await this.userService.create(req.user!.organizationId, req.body);
    res.status(201).json({ success: true, data: { user, temporaryPassword } });
  }

  async updateRole(req: Request, res: Response) {
    const { id } = req.params;
    const user = await this.userService.updateRole(req.user!.organizationId, id, req.body.role);
    res.json({ success: true, data: user });
  }

  async remove(req: Request, res: Response) {
    const { id } = req.params;
    await this.userService.remove(req.user!.organizationId, id, req.user!.id);
    res.json({ success: true, message: 'User removed successfully' });
  }
}
