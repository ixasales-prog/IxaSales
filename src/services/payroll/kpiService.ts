export class KPIService {
  async getKPIsForPeriod(_tenantId: string, _userId: string, _startDate: string, _endDate: string) {
    return [];
  }
}

export const kpiService = new KPIService();
