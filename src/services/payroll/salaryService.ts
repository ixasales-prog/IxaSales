type SalaryConfig = {
  userId: string;
  baseSalary: string | number;
};

export class SalaryService {
  // Temporary shim to keep payroll-run builds working until full payroll schema is restored.
  async getActiveSalaryConfigurations(_tenantId: string, _asOfDate?: string): Promise<SalaryConfig[]> {
    return [];
  }
}

export const salaryService = new SalaryService();
