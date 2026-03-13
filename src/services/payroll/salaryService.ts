export class SalaryService {
  // Temporary shim to keep payroll-run builds working until the full payroll module lands.
  async getActiveSalaryConfigurations(_tenantId: string, _asOfDate?: string) {
    return [] as any[];
  }
}

export const salaryService = new SalaryService();
