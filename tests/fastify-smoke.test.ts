
import { test } from 'node:test';
import assert from 'node:assert';
import { buildServer } from '../src/index-fastify';

test('Fastify Server Smoke Test', async (t) => {
    const server = await buildServer();

    await t.test('GET /health should return 200', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/health'
        });

        assert.strictEqual(response.statusCode, 200);
        const body = JSON.parse(response.body);
        assert.strictEqual(body.status, 'ok');
    });

    await t.test('GET / should return 200', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/'
        });

        assert.strictEqual(response.statusCode, 200);
        const body = JSON.parse(response.body);
        assert.strictEqual(body.success, true);
    });

    await t.test('GET /api/announcement should return 200', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/api/announcement'
        });

        assert.strictEqual(response.statusCode, 200);
        const body = JSON.parse(response.body);
        assert.ok(body.success);
    });

    await server.close();
});
