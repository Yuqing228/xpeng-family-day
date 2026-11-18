import { Injectable, Logger } from '@nestjs/common';
import { AuthorizationSDK, type I18nText, type SearchUserEntity } from '@lark-apaas/nestjs-authzpaas';

/**
 * 触发器是系统任务，没有登录用户，平台会返回 data:null 空信封；
 * 这里固定以项目负责人周海杰（zhouhj3@xiaopeng.com）的身份发起搜索。
 */
const SEARCH_PROXY_USER_ID: string = '1774193346886711';

/**
 * 平台搜索接口结果不稳定：同一 query 连续调用会在「空」与「有结果」之间跳变，
 * 实测 15 个真实工号连测三次，每次命中集合都不同。空结果不代表查无此人，
 * 因此空返回时重试，拿到非空即停。
 */
const SEARCH_ATTEMPTS: number = 3;
const SEARCH_RETRY_DELAY_MS: number = 300;

export type DirectoryOutcome = 'hit' | 'ambiguous' | 'not_found' | 'unresolved';

export interface DirectoryResolution {
  outcome: DirectoryOutcome;
  userId: string | null;
  candidateCount: number;
  scannedCount: number;
}

@Injectable()
export class EmployeeDirectoryService {
  private readonly logger = new Logger(EmployeeDirectoryService.name);

  constructor(private readonly authzSdk: AuthorizationSDK) {}

  /** 按工号搜索平台通讯录，姓名严格校验后返回唯一妙搭用户 ID */
  async resolveByCustNum(custNum: string, expectedName: string): Promise<DirectoryResolution> {
    const query: string = custNum.trim();
    const nameKey: string = this.normalizeName(expectedName);
    if (query.length === 0 || nameKey.length === 0) {
      return { outcome: 'not_found', userId: null, candidateCount: 0, scannedCount: 0 };
    }

    let items: SearchUserEntity[] = [];
    let lastError: unknown = null;
    let attemptsUsed: number = 0;
    for (let attempt = 1; attempt <= SEARCH_ATTEMPTS; attempt += 1) {
      if (attempt > 1) {
        await this.sleep(SEARCH_RETRY_DELAY_MS);
      }
      attemptsUsed = attempt;
      try {
        const response = await this.authzSdk.search.search({
          query,
          userID: SEARCH_PROXY_USER_ID,
          pageSize: 20,
        });
        items = response.result?.userResult?.items ?? [];
        lastError = null;
        if (items.length > 0) {
          break;
        }
      } catch (error) {
        lastError = error;
        items = [];
      }
    }

    if (items.length === 0) {
      if (lastError !== null) {
        this.logger.warn(
          `通讯录搜索失败：工号 ${query}，代表身份 ${SEARCH_PROXY_USER_ID}，尝试 ${attemptsUsed} 次，${String(lastError)}`,
        );
        return { outcome: 'unresolved', userId: null, candidateCount: 0, scannedCount: 0 };
      }
      this.logger.warn(
        `通讯录搜索无结果：工号 ${query}，代表身份 ${SEARCH_PROXY_USER_ID}，已尝试 ${attemptsUsed} 次`,
      );
      return { outcome: 'not_found', userId: null, candidateCount: 0, scannedCount: 0 };
    }

    const matched: string[] = [];
    for (const item of items) {
      const userId: string | undefined = item.miaodaUserID ?? item.userID;
      if (!userId) {
        continue;
      }
      const itemNameKey: string = this.normalizeName(this.pickName(item.name));
      if (itemNameKey.length === 0 || itemNameKey !== nameKey) {
        continue;
      }
      if (!matched.includes(userId)) {
        matched.push(userId);
      }
    }

    if (matched.length === 1) {
      return { outcome: 'hit', userId: matched[0], candidateCount: 1, scannedCount: items.length };
    }
    if (matched.length > 1) {
      return { outcome: 'ambiguous', userId: null, candidateCount: matched.length, scannedCount: items.length };
    }
    return { outcome: 'not_found', userId: null, candidateCount: 0, scannedCount: items.length };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private pickName(name: I18nText | undefined): string {
    if (!name) {
      return '';
    }
    return name.zh_cn ?? name.en_us ?? '';
  }

  private normalizeName(value: string): string {
    return value.replace(/\s+/gu, '').toLowerCase();
  }
}
