const FIXED_COMPANY_ID = 'test_company';

/**
 * Get company_id with priority:
 *   1. Firebase auth context (requireFirebaseAuth が c.set('user', ...) でセット)
 *   2. Cookie の company_id（SSRページ向けフォールバック）
 *   3. FIXED_COMPANY_ID（最終フォールバック）
 */
export function getCompanyId(c: any): string {
  // 1. Firebase 認証後のユーザーコンテキストから取得（最優先）
  const user = c.get?.('user') as { companyId?: string } | undefined;
  if (user?.companyId) {
    return user.companyId;
  }

  // 2. Cookie から取得（SSRページ・レガシー互換）
  const cookies = c.req.header('Cookie') || '';
  const companyIdMatch = cookies.match(/company_id=([^;]+)/);
  if (companyIdMatch) {
    return companyIdMatch[1];
  }

  // 3. フォールバック
  return FIXED_COMPANY_ID;
}

export { FIXED_COMPANY_ID }
