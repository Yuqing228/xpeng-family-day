// 管理员守卫：白名单外的飞书身份一律 403（specs/admin-refund「管理员权限」）
import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminService } from './admin.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly adminService: AdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const userId = req.userContext?.userId;
    if (!userId) {
      res.setHeader('x-login-url', req.userContext?.loginUrl || '');
      res.status(HttpStatus.UNAUTHORIZED).json({
        error: { code: 'UNAUTHORIZED', message: '需要登录后才能执行操作', timestamp: Date.now() },
      });
      return false;
    }
    if (!(await this.adminService.isAdmin(userId))) {
      res.status(HttpStatus.FORBIDDEN).json({
        error: { code: 'FORBIDDEN', message: '仅管理员可访问后台', timestamp: Date.now() },
      });
      return false;
    }
    return true;
  }
}
