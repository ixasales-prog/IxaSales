const BASE_URL = 'http://localhost:3000';

async function verifyApi() {
    console.log(`🔍 Verifying API at ${BASE_URL}...`);

    try {
        // 1. Health Check
        console.log('Checking /health...');
        const healthRes = await fetch(`${BASE_URL}/health`);
        if (healthRes.status === 200) {
            console.log('✅ /health is OK');
            const data = await healthRes.json();
            console.log('   Response:', data);
        } else {
            console.error('❌ /health failed:', healthRes.status, healthRes.statusText);
        }

        // 2. Auth Check (Attempt likely login)
        console.log('\nChecking /api/auth/login (Smoke Test)...');
        // We don't know exact creds, but we can test validation
        const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'test@example.com', password: 'wrongpassword' }),
        });

        if (loginRes.status === 401 || loginRes.status === 400 || loginRes.status === 404) {
            console.log('✅ Auth endpoint is responding (Expected 401/404 for bad creds):', loginRes.status);
            const data = await loginRes.json();
            console.log('   Response:', data);
        } else {
            console.error('❌ Auth endpoint unexpected status:', loginRes.status);
        }

        console.log('\n✨ API Verification Complete (Basic Connectivity)');

    } catch (error) {
        console.error('❌ Verification failed. Ensure server is running (npm run dev).');
        console.error(error);
    }
}

verifyApi();
