// 请求用户参数装饰器：从平台注入的 userContext 取身份
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const ReqUserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.userContext?.userId || '';
});

/** 操作人显示名（台账「操作摊主」留痕口径：收款=摊主名、退款=管理员名） */
export const ReqUserName = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const ctxUser = req.userContext;
  const i18nName = ctxUser?.userNameI18n;
  if (i18nName && typeof i18nName === 'object' && i18nName.zh_cn) return String(i18nName.zh_cn);
  if (typeof ctxUser?.userName === 'string' && ctxUser.userName) return ctxUser.userName;
  return ctxUser?.userId || '未知操作人';
});
