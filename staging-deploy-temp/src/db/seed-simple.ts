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

async function seedDatabase() {
  console.log('🌱 Starting sample data seeding...\n');

  try {
    // Check if we already have data
    const existingTenants = await db.select().from(tenants).limit(1);
    if (existingTenants.length > 0) {
      console.log('✅ Database already has data. Skipping seeding.');
      console.log(`Found tenant: ${existingTenants[0].name}`);
      return;
    }

    // 1. Create Tenant
    console.log('🏢 Creating tenant...');
    const tenantResult = await db.insert(tenants).values({
      name: 'Demo Company',
      subdomain: 'demo',
      plan: 'pro',
      maxUsers: 20,
      maxProducts: 1000,
      maxOrdersPerMonth: 5000,
      currency: 'UZS',
      timezone: 'Asia/Tashkent',
      defaultTaxRate: '15.00',
      orderNumberPrefix: 'ORD-',
      invoiceNumberPrefix: 'INV-',
      defaultPaymentTerms: 14,
      address: '123 Business Street',
      city: 'Tashkent',
      country: 'Uzbekistan',
      phone: '+998901234567',
      email: 'info@democompany.uz',
      website: 'https://democompany.uz',
      taxId: '123456789',
      logo: 'https://placehold.co/200x100/EEE/31343C?text=Demo+Logo',
      subscriptionEndAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      planStatus: 'active',
      telegramEnabled: true,
      telegramBotUsername: 'DemoCompanyBot',
      paymentPortalEnabled: true,
      isActive: true
    }).returning();
    
    const tenantId = tenantResult[0].id;
    console.log(`✅ Tenant created: ${tenantResult[0].name}\n`);

    // 2. Create Users
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
      }
    ]).returning();
    
    const [adminUser, salesUser] = userResults;
    console.log(`✅ ${userResults.length} users created\n`);

    // 3. Create Categories
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
      }
    ]).returning();
    
    const [electronicsCat, clothingCat] = categoryResults;
    console.log(`✅ ${categoryResults.length} categories created\n`);

    // 4. Create Subcategories
    console.log('📂 Creating subcategories...');
    const subcategoryResults = await db.insert(subcategories).values([
      {
        tenantId,
        categoryId: electronicsCat.id,
        name: 'Smartphones',
        sortOrder: 1,
        isActive: true
      },
      {
        tenantId,
        categoryId: electronicsCat.id,
        name: 'Laptops',
        sortOrder: 2,
        isActive: true
      },
      {
        tenantId,
        categoryId: clothingCat.id,
        name: 'Men\'s Wear',
        sortOrder: 1,
        isActive: true
      }
    ]).returning();
    console.log(`✅ ${subcategoryResults.length} subcategories created\n`);

    // 5. Create Brands
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
      }
    ]).returning();
    console.log(`✅ ${brandResults.length} brands created\n`);

    // 6. Create Suppliers
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

    // 7. Create Customers
    console.log('👥 Creating customers...');
    const customerResults = await db.insert(customers).values([
      {
        tenantId,
        assignedSalesRepId: salesUser.id,
        createdByUserId: adminUser.id,
        code: 'CUST-001',
        name: 'Premium Electronics Store',
        contactPerson: 'Mr. Karimov',
        phone: '+998905555555',
        email: 'karimov@premielectronics.uz',
        address: '123 Main Street, Tashkent',
        waymark: 'Near Metro Station',
        latitude: '41.31108100',
        longitude: '69.24056700',
        creditBalance: '0.00',
        debtBalance: '0.00',
        notes: 'Long-term premium customer',
        lastOrderDate: new Date(),
        telegramChatId: '123456789',
        isActive: true
      },
      {
        tenantId,
        assignedSalesRepId: salesUser.id,
        createdByUserId: adminUser.id,
        code: 'CUST-002',
        name: 'Fashion Boutique',
        contactPerson: 'Ms. Rakhimova',
        phone: '+998906666666',
        email: 'rakhimova@fashionboutique.uz',
        address: '456 Fashion Avenue, Tashkent',
        waymark: 'Opposite Park',
        latitude: '41.33833300',
        longitude: '69.29750000',
        creditBalance: '0.00',
        debtBalance: '0.00',
        notes: 'Regular fashion customer',
        lastOrderDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        isActive: true
      }
    ]).returning();
    console.log(`✅ ${customerResults.length} customers created\n`);

    // 8. Create Products
    console.log('📦 Creating products...');
    const productResults = await db.insert(products).values([
      {
        tenantId,
        subcategoryId: subcategoryResults[0].id, // Smartphones
        brandId: brandResults[0].id, // Samsung
        supplierId: supplierResults[0].id, // Tech Distributors
        sku: 'SM-G991B',
        name: 'Samsung Galaxy S21',
        description: 'Latest Samsung flagship smartphone with advanced camera system',
        unit: 'piece',
        price: '8999000.00',
        costPrice: '7500000.00',
        stockQuantity: 50,
        reservedQuantity: 5,
        reorderPoint: 10,
        taxRate: '15.00',
        barcode: '8806092222222',
        imageUrl: 'https://placehold.co/300x300/1428A0/FFFFFF?text=Galaxy+S21',
        isActive: true
      },
      {
        tenantId,
        subcategoryId: subcategoryResults[1].id, // Laptops
        brandId: brandResults[1].id, // Apple
        supplierId: supplierResults[0].id,
        sku: 'MLH43LL/A',
        name: 'MacBook Air M1',
        description: 'Apple MacBook Air with M1 chip, 13-inch display',
        unit: 'piece',
        price: '12999000.00',
        costPrice: '10500000.00',
        stockQuantity: 30,
        reservedQuantity: 2,
        reorderPoint: 5,
        taxRate: '15.00',
        barcode: '190199000000',
        imageUrl: 'https://placehold.co/300x300/A2AAAD/000000?text=MacBook+Air',
        isActive: true
      },
      {
        tenantId,
        subcategoryId: subcategoryResults[2].id, // Men's Wear
        brandId: brandResults[2].id, // Nike
        supplierId: supplierResults[1].id, // Fashion World
        sku: 'NIKE-AIR-MAX',
        name: 'Nike Air Max 270',
        description: 'Men\'s running shoes with Air cushioning technology',
        unit: 'pair',
        price: '1299000.00',
        costPrice: '850000.00',
        stockQuantity: 100,
        reservedQuantity: 10,
        reorderPoint: 20,
        taxRate: '15.00',
        barcode: '123456789012',
        imageUrl: 'https://placehold.co/300x300/F00/FFFFFF?text=Nike+Air+Max',
        isActive: true
      }
    ]).returning();
    console.log(`✅ ${productResults.length} products created\n`);

    // 9. Create Orders
    console.log('🛒 Creating orders...');
    const orderResults = await db.insert(orders).values([
      {
        tenantId,
        orderNumber: 'ORD-001',
        customerId: customerResults[0].id,
        salesRepId: salesUser.id,
        createdByUserId: adminUser.id,
        status: 'delivered',
        paymentStatus: 'paid',
        subtotalAmount: '17998000.00',
        discountAmount: '2699700.00',
        taxAmount: '2294745.00',
        totalAmount: '17593045.00',
        paidAmount: '17593045.00',
        notes: 'Urgent delivery requested',
        requestedDeliveryDate: new Date(),
        deliveredAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      }
    ]).returning();
    console.log(`✅ ${orderResults.length} orders created\n`);

    // 10. Create Order Items
    console.log('📋 Creating order items...');
    await db.insert(orderItems).values([
      {
        orderId: orderResults[0].id,
        productId: productResults[0].id, // Samsung Galaxy S21
        unitPrice: '8999000.00',
        qtyOrdered: 2,
        qtyPicked: 2,
        qtyDelivered: 2,
        qtyReturned: 0,
        discountAmount: '2699700.00',
        taxAmount: '1169865.00',
        lineTotal: '16468165.00'
      }
    ]);
    console.log('✅ Order items created\n');

    console.log('\n🎉 Sample data seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`🏢 Tenants: 1`);
    console.log(`👥 Users: ${userResults.length}`);
    console.log(`📚 Categories: ${categoryResults.length}`);
    console.log(`📂 Subcategories: ${subcategoryResults.length}`);
    console.log(`🏷️  Brands: ${brandResults.length}`);
    console.log(`🚚 Suppliers: ${supplierResults.length}`);
    console.log(`👥 Customers: ${customerResults.length}`);
    console.log(`📦 Products: ${productResults.length}`);
    console.log(`🛒 Orders: ${orderResults.length}`);
    console.log(`📋 Order Items: 1`);

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the seed function
if (require.main === module) {
  seedDatabase().catch(console.error);
}

export { seedDatabase };