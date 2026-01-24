/**
 * Test script for Dashboard API endpoints
 * Run with: npx tsx scripts/test-dashboard-apis.ts
 * 
 * Note: Requires a valid auth token. Set AUTH_TOKEN environment variable.
 */

import 'dotenv/config';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

interface TestResult {
    endpoint: string;
    status: 'PASS' | 'FAIL' | 'SKIP';
    message: string;
    data?: any;
}

async function testEndpoint(name: string, path: string, method: string = 'GET', body?: any): Promise<TestResult> {
    try {
        const options: RequestInit = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AUTH_TOKEN}`,
            },
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${API_URL}${path}`, options);
        const result = await response.json();

        if (response.ok && result.success !== false) {
            return {
                endpoint: name,
                status: 'PASS',
                message: `✅ ${response.status} - Success`,
                data: result.data ? Object.keys(result.data).join(', ') : 'No data',
            };
        } else {
            return {
                endpoint: name,
                status: 'FAIL',
                message: `❌ ${response.status} - ${result.error?.message || 'Unknown error'}`,
            };
        }
    } catch (error: any) {
        return {
            endpoint: name,
            status: 'FAIL',
            message: `❌ Error: ${error.message}`,
        };
    }
}

async function runTests() {
    console.log('🧪 Testing Dashboard API Endpoints\n');
    console.log(`API URL: ${API_URL}\n`);

    if (!AUTH_TOKEN) {
        console.log('⚠️  AUTH_TOKEN not set. Some tests may fail.\n');
    }

    const tests: TestResult[] = [];

    // Phase 1
    console.log('📊 Phase 1: Core Enhancements');
    tests.push(await testEndpoint('Dashboard Stats', '/api/orders/dashboard-stats'));
    tests.push(await testEndpoint('Sales Goals (GET)', '/api/orders/sales-goals'));
    tests.push(await testEndpoint('Sales Goals (PUT)', '/api/orders/sales-goals', 'PUT', { daily: 1000000, weekly: 5000000, monthly: 20000000 }));

    // Phase 2
    console.log('\n📈 Phase 2: Analytics');
    tests.push(await testEndpoint('Sales Trends', '/api/orders/sales-trends?period=7d'));
    tests.push(await testEndpoint('Product Performance', '/api/orders/product-performance?days=30&limit=5'));
    tests.push(await testEndpoint('Time Insights', '/api/orders/time-insights'));
    tests.push(await testEndpoint('Performance Metrics', '/api/orders/performance-metrics'));

    // Phase 3
    console.log('\n🚀 Phase 3: Advanced Features');
    tests.push(await testEndpoint('Route Optimization', '/api/orders/route-optimization'));
    tests.push(await testEndpoint('Gamification', '/api/orders/gamification'));
    tests.push(await testEndpoint('Weather', '/api/orders/weather'));

    // Results
    console.log('\n' + '='.repeat(60));
    console.log('📋 Test Results Summary');
    console.log('='.repeat(60) + '\n');

    const passed = tests.filter(t => t.status === 'PASS').length;
    const failed = tests.filter(t => t.status === 'FAIL').length;
    const skipped = tests.filter(t => t.status === 'SKIP').length;

    tests.forEach(test => {
        const icon = test.status === 'PASS' ? '✅' : test.status === 'FAIL' ? '❌' : '⏭️';
        console.log(`${icon} ${test.endpoint}`);
        console.log(`   ${test.message}`);
        if (test.data) {
            console.log(`   Data: ${test.data}`);
        }
        console.log('');
    });

    console.log('='.repeat(60));
    console.log(`Total: ${tests.length} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);
    console.log('='.repeat(60));

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(console.error);
