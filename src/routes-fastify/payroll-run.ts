import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { simplePayrollRunner } from '../services/payroll/simplePayrollRunner';
import { criticalEndpointLimiter } from '../lib/advanced-rate-limiting';

export default async function payrollRunRoutes(fastify: FastifyInstance) {
  const RunPayrollBodySchema = Type.Object({
    periodId: Type.String({ minLength: 1 }),
    startDate: Type.String({ minLength: 1 }),
    endDate: Type.String({ minLength: 1 }),
  });

  fastify.post(
    '/run',
    {
      preHandler: [fastify.authenticate, criticalEndpointLimiter.payroll],
      schema: { body: RunPayrollBodySchema },
    },
    async (request, reply) => {
      try {
        const { tenantId, role } = request.user!;
        if (role !== 'tenant_admin' && role !== 'super_admin') {
          return reply.code(403).send({ error: 'Only administrators can run payroll' });
        }

        const { periodId, startDate, endDate } = request.body as {
          periodId: string;
          startDate: string;
          endDate: string;
        };

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
          return reply.code(400).send({ error: 'Invalid payroll date range' });
        }

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
