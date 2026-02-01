import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from 'dotenv';
import { 
  tenants,
  users,
  categories,
  subcategories,
  brands,
  suppliers,
  products,
  customers,
  orders,
  orderItems
} from './schema';

// Load environment variables
config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:HelpMe11@localhost:5432/ixasales';
const client = postgres(connectionString);
const db = drizzle(client);

async function addSampleData() {
  console.log('🌱 Adding sample data to existing database...\n');

  try {
    // Get existing tenant
    const tenantsData = await db.select().from(tenants).limit(1);
    if (tenantsData.length === 0) {
      console.log('❌ No tenants found. Please create a tenant first.');
      return;
    }
    
    const tenantId = tenantsData[0].id;
    console.log(`Using tenant: ${tenantsData[0].name}\n`);

    // Check if users already exist
    const existingUsers = await db.select().from(users).where(users.tenantId.eq(tenantId)).limit(1);
    if (existingUsers.length > 0) {
      console.log('✅ Users already exist. Skipping user creation.');
    } else {
      // Create Users
      console.log('👥 Creating users...');
      const userResults = await db.insert(users).values([
        {
          tenantId,
          name: 'Admin User',
          email: 'admin@democompany.uz',
          role: 'tenant_admin',
          phone: '+998901234567',
          isActive: true,
          passwordHash: '$2a$10$...' // Hashed password
        },
        {
          tenantId,
          name: 'Sales Manager',
          email: 'sales@democompany.uz',
          role: 'sales_rep',
          phone: '+998901234568',
          isActive: true,
          passwordHash: '$2a$10$...'
        },
        {
          tenantId,
          name: 'Warehouse Manager',
          email: 'warehouse@democompany.uz',
          role: 'warehouse',
          phone: '+998901234569',
          isActive: true,
          passwordHash: '$2a$10$...'
        }
      ]).returning();
      
      console.log(`✅ ${userResults.length} users created\n`);
    }

    // Check if categories already exist
    const existingCategories = await db.select().from(categories).where(categories.tenantId.eq(tenantId)).limit(1);
    if (existingCategories.length > 0) {
      console.log('✅ Categories already exist. Skipping category creation.');
    } else {
      // Create Categories
      console.log('📚 Creating categories...');
      const categoryResults = await db.insert(categories).values([
        {
          tenantId,
          name: 'Electronics',
          sortOrder: 1,
          isActive: true
        },
        {
          tenantId,
          name: 'Clothing',
          sortOrder: 2,
          isActive: true
        },
        {
          tenantId,
          name: 'Food & Beverages',
          sortOrder: 3,
          isActive: true
        }
      ]).returning();
      
      console.log(`✅ ${categoryResults.length} categories created\n`);
    }

    // Get categories for subcategories
    const categoriesData = await db.select().from(categories).where(categories.tenantId.eq(tenantId));
    
    // Check if subcategories already exist
    const existingSubcategories = await db.select().from(subcategories).where(subcategories.tenantId.eq(tenantId)).limit(1);
    if (existingSubcategories.length > 0) {
      console.log('✅ Subcategories already exist. Skipping subcategory creation.');
    } else {
      // Create Subcategories
      console.log('📂 Creating subcategories...');
      const subcategoryResults = await db.insert(subcategories).values([
        {
          tenantId,
          categoryId: categoriesData[0].id, // Electronics
          name: 'Smartphones',
          sortOrder: 1,
          isActive: true
        },
        {
          tenantId,
          categoryId: categoriesData[0].id, // Electronics
          name: 'Laptops',
          sortOrder: 2,
          isActive: true
        },
        {
          tenantId,
          categoryId: categoriesData[1].id, // Clothing
          name: 'Men\'s Wear',
          sortOrder: 1,
          isActive: true
        },
        {
          tenantId,
          categoryId: categoriesData[1].id, // Clothing
          name: 'Women\'s Wear',
          sortOrder: 2,
          isActive: true
        }
      ]).returning();
      
      console.log(`✅ ${subcategoryResults.length} subcategories created\n`);
    }

    // Check if brands already exist
    const existingBrands = await db.select().from(brands).where(brands.tenantId.eq(tenantId)).limit(1);
    if (existingBrands.length > 0) {
      console.log('✅ Brands already exist. Skipping brand creation.');
    } else {
      // Create Brands
      console.log('🏷️  Creating brands...');
      const brandResults = await db.insert(brands).values([
        {
          tenantId,
          name: 'Samsung',
          logoUrl: 'https://placehold.co/100x50/1428A0/FFFFFF?text=Samsung',
          isActive: true
        },
        {
          tenantId,
          name: 'Apple',
          logoUrl: 'https://placehold.co/100x50/A2AAAD/000000?text=Apple',
          isActive: true
        },
        {
          tenantId,
          name: 'Nike',
          logoUrl: 'https://placehold.co/100x50/F00/FFFFFF?text=Nike',
          isActive: true
        },
        {
          tenantId,
          name: 'Adidas',
          logoUrl: 'https://placehold.co/100x50/000/FFFFFF?text=Adidas',
          isActive: true
        }
      ]).returning();
      
      console.log(`✅ ${brandResults.length} brands created\n`);
    }

    // Check if suppliers already exist
    const existingSuppliers = await db.select().from(suppliers).where(suppliers.tenantId.eq(tenantId)).limit(1);
    if (existingSuppliers.length > 0) {
      console.log('✅ Suppliers already exist. Skipping supplier creation.');
    } else {
      // Create Suppliers
      console.log('🚚 Creating suppliers...');
      const supplierResults = await db.insert(suppliers).values([
        {
          tenantId,
          name: 'Tech Distributors LLC',
          contactPerson: 'Alex Johnson',
          phone: '+998901111111',
          email: 'alex@techdist.uz',
          address: '456 Tech Avenue, Tashkent',
          balance: '0.00',
          isActive: true
        },
        {
          tenantId,
          name: 'Fashion World Co.',
          contactPerson: 'Maria Garcia',
          phone: '+998902222222',
          email: 'maria@fashionworld.uz',
          address: '789 Fashion Street, Tashkent',
          balance: '0.00',
          isActive: true
        }
      ]).returning();
      
      console.log(`✅ ${supplierResults.length} suppliers created\n`);
    }

    console.log('\n🎉 Sample data addition completed successfully!');
    console.log('\n📊 Current database state:');
    
    // Show current counts
    const userData = await db.select().from(users).where(users.tenantId.eq(tenantId));
    const categoryData = await db.select().from(categories).where(categories.tenantId.eq(tenantId));
    const subcategoryData = await db.select().from(subcategories).where(subcategories.tenantId.eq(tenantId));
    const brandData = await db.select().from(brands).where(brands.tenantId.eq(tenantId));
    const supplierData = await db.select().from(suppliers).where(suppliers.tenantId.eq(tenantId));
    
    console.log(`👥 Users: ${userData.length}`);
    console.log(`📚 Categories: ${categoryData.length}`);
    console.log(`📂 Subcategories: ${subcategoryData.length}`);
    console.log(`🏷️  Brands: ${brandData.length}`);
    console.log(`🚚 Suppliers: ${supplierData.length}`);

  } catch (error) {
    console.error('❌ Error adding sample data:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the function
if (require.main === module) {
  addSampleData().catch(console.error);
}

export { addSampleData };