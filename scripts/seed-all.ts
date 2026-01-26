import { seedDatabase } from './seed-all-tables';

async function runSeed() {
  console.log('🚀 Running comprehensive database seed...\n');
  
  try {
    await seedDatabase();
    console.log('\n✅ Seed completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  }
}

runSeed();