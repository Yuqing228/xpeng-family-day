// 登录守卫：员工端 / 摊主端接口要求飞书身份（specs identity-management / merchant-terminal）
// 未登录时返回 401 + x-login-url 头，客户端 axiosForBackend 拦截器会自动跳转登录
import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

@Injectable()
export class LoginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const userId = req.userContext?.userId;
    if (!userId) {
      res.setHeader('x-login-url', req.userContext?.loginUrl || '');
      res.status(HttpStatus.UNAUTHORIZED).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '需要登录后才能执行操作',
          timestamp: Date.now(),
        },
      });
      return false;
    }
    return true;
  }
}
