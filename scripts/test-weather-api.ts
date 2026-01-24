/**
 * Test OpenWeatherMap API key
 * Run with: npx tsx scripts/test-weather-api.ts
 */

const API_KEY = '6cf242bf83585423984589cd7a3519d5';
const CITY = 'Tashkent';
const COUNTRY = 'UZ';

async function testWeatherAPI() {
    console.log('🌤️  Testing OpenWeatherMap API Key\n');
    console.log(`API Key: ${API_KEY.substring(0, 10)}...`);
    console.log(`Location: ${CITY}, ${COUNTRY}\n`);

    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${CITY},${COUNTRY}&appid=${API_KEY}&units=metric`;
        console.log('Fetching weather data...\n');

        const response = await fetch(url);
        const data = await response.json();

        if (response.ok) {
            console.log('✅ API Key is VALID!\n');
            console.log('Weather Data:');
            console.log(`  City: ${data.name}`);
            console.log(`  Temperature: ${Math.round(data.main.temp)}°C`);
            console.log(`  Condition: ${data.weather[0].main}`);
            console.log(`  Description: ${data.weather[0].description}`);
            console.log(`  Humidity: ${data.main.humidity}%`);
            console.log(`  Wind Speed: ${data.wind?.speed || 0} m/s`);
            console.log(`  Feels Like: ${Math.round(data.main.feels_like)}°C`);
            console.log('\n✅ API key is working correctly!');
            console.log('\nNext steps:');
            console.log('1. Run migration: npx tsx src/db/migrations/add_openweather_api_key.ts');
            console.log('2. Configure in Business Settings UI: /admin/business-settings');
            console.log('3. Or set globally in .env: OPENWEATHER_API_KEY=' + API_KEY);
        } else {
            console.log('❌ API Key is INVALID or ERROR occurred\n');
            console.log(`Status: ${response.status}`);
            console.log(`Error: ${data.message || 'Unknown error'}`);
            if (data.cod === 401) {
                console.log('\n⚠️  This usually means:');
                console.log('  - API key is incorrect');
                console.log('  - API key is not activated yet');
                console.log('  - API key has been revoked');
            }
        }
    } catch (error: any) {
        console.log('❌ Network Error:');
        console.log(`  ${error.message}`);
    }
}

testWeatherAPI();
