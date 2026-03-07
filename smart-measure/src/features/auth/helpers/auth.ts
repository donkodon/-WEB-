import type { Context } from 'hono'
import type { AppEnv } from '../../../types/bindings'

const FIXED_COMPANY_ID = 'test_company';

/**
 * Get company_id with priority:
 *   1. Firebase auth context (requireFirebaseAuth が c.set('user', ...) でセット)
 *   2. Cookie の company_id（SSRページ向けフォールバック）
 *   3. FIXED_COMPANY_ID（最終フォールバック）
 */
export function getCompanyId(c: Context<AppEnv>): string {
  // 1. Firebase 認証後のユーザーコンテキストから取得（最優先）
  const user = c.get?.('user') as { companyId?: string } | undefined;
  console.log('🔍 getCompanyId - user context:', user);
  if (user?.companyId) {
    console.log('✅ Using company_id from Firebase user:', user.companyId);
    return user.companyId;
  }

  // 2. Cookie から取得（SSRページ・レガシー互換）
  const cookies = c.req.header('Cookie') || '';
  const companyIdMatch = cookies.match(/company_id=([^;]+)/);
  if (companyIdMatch) {
    console.log('✅ Using company_id from cookie:', companyIdMatch[1]);
    return companyIdMatch[1];
  }

  // 3. フォールバック
  console.log('⚠️ Using FIXED_COMPANY_ID fallback:', FIXED_COMPANY_ID);
  return FIXED_COMPANY_ID;
}

export { FIXED_COMPANY_ID }
