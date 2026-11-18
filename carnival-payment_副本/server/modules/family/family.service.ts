// 家人端：token 链接免登录（无需飞书）；窗口外/已删除 → 失效提示（specs/payment-code-h5）
import { Injectable, Inject, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { AppConfigService } from '@server/modules/config/config.service';
import { LeniuService } from '@server/modules/leniu/leniu.service';
import {
  IdentityService,
  type FamilyPayerIdentity,
} from '@server/modules/identity/identity.service';
import { RELATION_LABELS, maskEmployeeName } from '@server/common/utils/mask';
import { BusinessException } from '@server/common/interfaces/exception.interface';
import { ResponseCode } from '@server/common/constants/api_response_code';
import { HttpStatus } from '@nestjs/common';
import type { FamilySession } from '@shared/api.interface';

@Injectable()
export class FamilyService {
  private readonly logger = new Logger(FamilyService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly config: AppConfigService,
    private readonly leniu: LeniuService,
    private readonly identity: IdentityService,
  ) {}

  /** token → 付款身份会话（免登录）。无效 token 404；窗口外 403 OUT_OF_WINDOW（页面提示失效） */
  async session(token: string): Promise<FamilySession> {
    const family = await this.resolveFamily(token);
    if (!(await this.config.isInEventWindow())) {
      throw new BusinessException(ResponseCode.FORBIDDEN, '链接仅活动当天有效，现已失效', HttpStatus.FORBIDDEN, 'OUT_OF_WINDOW');
    }
    let balance = 0;
    try {
      const { custId, fresh } = await this.identity.resolveCustId(family.employee);
      if (fresh) this.identity.schedulePersistCustId(family.employee.miaodaUserId, custId);
      const snapshot = await this.identity.queryBalance(custId);
      balance = snapshot.balanceFen / 100;
    } catch (error) {
      this.logger.warn(
        `家人端余额查询失败 user=${family.employee.miaodaUserId}: ${String(error)}`,
      );
    }
    return {
      displayName: family.familyName,
      relationLabel: RELATION_LABELS[family.relation ?? 'other'] ?? '家人',
      employeeMaskedName: maskEmployeeName(family.employee.employeeName),
      cardLast4: family.employee.custNum.slice(-4),
      balance,
      inEventWindow: true,
      isSelf: family.isSelf,
      payPasswordSet: family.hasPayPassword,
      payLocked: family.payLocked,
    };
  }

  /** 分享 token → 家人身份（无效或已作废统一 404，页面走失效提示） */
  private async resolveFamily(token: string): Promise<FamilyPayerIdentity> {
    try {
      return await this.identity.resolveFamilyPayer(token);
    } catch {
      throw new BusinessException(
        ResponseCode.NOT_FOUND,
        '专属链接无效或已失效',
        HttpStatus.NOT_FOUND,
      );
    }
  }

}
