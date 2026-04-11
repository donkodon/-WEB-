import type { Context } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { logger } from '../../../shared/helpers/logger'

const FIXED_COMPANY_ID = 'test_company';

/**
 * Get company_id with priority:
 *   1. Firebase auth context (requireFirebaseAuth が c.set('user', ...) でセット)
 *   2. Cookie の company_id（SSRページ向けフォールバック）
 *   3. FIXED_COMPANY_ID（最終フォールバック）
 */
export function getCompanyId(c: Context<AppEnv>): string {
  // 1. Firebase 認証後のユーザーコンテキストから取得（最優先）
  const user = c.get?.('user') as { companyId?: string; email?: string; uid?: string } | undefined;
  
  if (user?.companyId) {
    logger.debug('🏢 [getCompanyId] From Firebase auth context:', {
      companyId: user.companyId,
      email: user.email,
      uid: user.uid,
      path: c.req.path
    });
    return user.companyId;
  } else if (user) {
    logger.warn('⚠️ [getCompanyId] User context exists but no companyId:', {
      user,
      path: c.req.path
    });
  }

  // 2. Cookie から取得（SSRページ・レガシー互換）
  const cookies = c.req.header('Cookie') || '';
  const companyIdMatch = cookies.match(/company_id=([^;]+)/);
  if (companyIdMatch) {
    logger.debug('🍪 [getCompanyId] From cookie:', {
      companyId: companyIdMatch[1],
      path: c.req.path
    });
    return companyIdMatch[1];
  }

  // 3. フォールバック
  logger.warn('⚠️ [getCompanyId] Using fallback FIXED_COMPANY_ID:', {
    fallback: FIXED_COMPANY_ID,
    path: c.req.path,
    hasUser: !!user,
    hasCookie: !!cookies
  });
  return FIXED_COMPANY_ID;
}

export { FIXED_COMPANY_ID }
