type SalaryConfig = {
  userId: string
  baseSalary: string | number
}

class SalaryService {
  // Fallback implementation until salary schema/tables are restored.
  async getActiveSalaryConfigurations(_tenantId: string, _asOfDate?: string): Promise<SalaryConfig[]> {
    return []
  }
}

export const salaryService = new SalaryService()
