import type { FastifyInstance } from 'fastify';
import { simplePayrollRunner } from '../services/payroll/simplePayrollRunner';

export default async function payrollRunRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/payroll/run',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { tenantId } = request.user!;
        const { periodId, startDate, endDate } = request.body as any;
        const results = await simplePayrollRunner.runPeriod(
          tenantId,
          periodId,
          startDate,
          endDate
        );
        return reply.send({ periodId, startDate, endDate, results });
      } catch (error) {
        request.log.error(error as any);
        return reply.code(500).send({ error: 'Failed to run payroll' });
      }
    }
  );
}
