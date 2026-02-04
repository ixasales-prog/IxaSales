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
  orders
} from './schema';

// Load environment variables
config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is required');
    console.error('💡 Example: DATABASE_URL=postgresql://user:password@localhost:5432/database');
    process.exit(1);
}
const client = postgres(connectionString);
const db = drizzle(client);

async function viewDatabaseData() {
  console.log('🔍 Viewing existing database data...\n');

  try {
    // View Tenants
    console.log('🏢 Tenants:');
    const tenantsData = await db.select().from(tenants);
    tenantsData.forEach(tenant => {
      console.log(`  - ${tenant.name} (${tenant.subdomain}) - Plan: ${tenant.plan}`);
    });
    console.log();

    // View Users
    console.log('👥 Users:');
    const usersData = await db.select().from(users);
    usersData.forEach(user => {
      console.log(`  - ${user.name} (${user.email}) - Role: ${user.role}`);
    });
    console.log();

    // View Categories
    console.log('📚 Categories:');
    const categoriesData = await db.select().from(categories);
    categoriesData.forEach(category => {
      console.log(`  - ${category.name}`);
    });
    console.log();

    // View Subcategories
    console.log('📂 Subcategories:');
    const subcategoriesData = await db.select().from(subcategories);
    subcategoriesData.forEach(subcategory => {
      console.log(`  - ${subcategory.name}`);
    });
    console.log();

    // View Brands
    console.log('🏷️  Brands:');
    const brandsData = await db.select().from(brands);
    brandsData.forEach(brand => {
      console.log(`  - ${brand.name}`);
    });
    console.log();

    // View Suppliers
    console.log('🚚 Suppliers:');
    const suppliersData = await db.select().from(suppliers);
    suppliersData.forEach(supplier => {
      console.log(`  - ${supplier.name} (${supplier.contactPerson})`);
    });
    console.log();

    // View Customers
    console.log('👥 Customers:');
    const customersData = await db.select().from(customers);
    customersData.forEach(customer => {
      console.log(`  - ${customer.name} (${customer.contactPerson})`);
    });
    console.log();

    // View Products
    console.log('📦 Products:');
    const productsData = await db.select().from(products);
    productsData.forEach(product => {
      console.log(`  - ${product.name} (${product.sku}) - Price: ${product.price}`);
    });
    console.log();

    // View Orders
    console.log('🛒 Orders:');
    const ordersData = await db.select().from(orders);
    ordersData.forEach(order => {
      console.log(`  - ${order.orderNumber} - Total: ${order.totalAmount} - Status: ${order.status}`);
    });
    console.log();

    console.log('📊 Summary:');
    console.log(`🏢 Tenants: ${tenantsData.length}`);
    console.log(`👥 Users: ${usersData.length}`);
    console.log(`📚 Categories: ${categoriesData.length}`);
    console.log(`📂 Subcategories: ${subcategoriesData.length}`);
    console.log(`🏷️  Brands: ${brandsData.length}`);
    console.log(`🚚 Suppliers: ${suppliersData.length}`);
    console.log(`👥 Customers: ${customersData.length}`);
    console.log(`📦 Products: ${productsData.length}`);
    console.log(`🛒 Orders: ${ordersData.length}`);

  } catch (error) {
    console.error('❌ Error viewing data:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the view function
if (require.main === module) {
  viewDatabaseData().catch(console.error);
}

export { viewDatabaseData };