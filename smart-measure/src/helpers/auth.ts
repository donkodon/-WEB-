// ==========================================
// Phase 1: Fixed company_id (will be dynamic in Phase 2 with Firebase Auth)
// ==========================================
const FIXED_COMPANY_ID = 'test_company';

/**
 * Get company_id from cookie (Phase 1 dynamic company_id)
 */
export function getCompanyId(c: any): string {
  const cookies = c.req.header('Cookie') || '';
  const companyIdMatch = cookies.match(/company_id=([^;]+)/);
  return companyIdMatch ? companyIdMatch[1] : FIXED_COMPANY_ID;
}

export { FIXED_COMPANY_ID }
