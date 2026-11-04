const logger = require('../config/logger');
const { Admin, Seller, User, Customer, Product, Tahsil, District, Category, SubCategory } = require('../models');

async function seedTestAccount() {
  const TEST_MOBILE = '7802807904';
  const TEST_OTP = '2002';

  try {
    // 1. Admin
    let admin = await Admin.findOne({
      $or: [
        { mobileNumber: TEST_MOBILE },
        { email: 'admin.test@primenear.in' },
        { email: '7802807904@primenear.in' },
      ],
    }).select('+password');

    if (!admin) {
      admin = new Admin({
        email: '7802807904@primenear.in',
        fullName: 'Test Super Admin',
        mobileNumber: TEST_MOBILE,
        password: TEST_OTP,
        role: 'SuperAdmin',
        isActive: true,
      });
      await admin.save();
      logger.info(`Test admin created: ${admin.email} (Mobile: ${TEST_MOBILE})`);
    } else {
      admin.mobileNumber = TEST_MOBILE;
      admin.isActive = true;
      admin.isDeleted = false;
      admin.lockUntil = undefined;
      admin.loginAttempts = 0;
      admin.password = TEST_OTP;
      await admin.save();
      logger.info(`Test admin updated: ${admin.email} (Mobile: ${TEST_MOBILE})`);
    }

    // 2. Tahsil & District
    let tahsil = await Tahsil.findOne({ name: 'Indore' });
    if (!tahsil) tahsil = await Tahsil.findOne();
    const allTahsils = await Tahsil.find();
    const allTahsilIds = allTahsils.map((t) => t._id);
    const districtId = tahsil?.districtId;

    if (!tahsil) {
      logger.warn('No tahsil found; skipping seller/user seeding');
      return;
    }

    // 3. Seller
    let seller = await Seller.findOne({ mobileNumber: TEST_MOBILE });
    if (!seller) {
      seller = await Seller.create({
        shopName: 'Prime Test Store',
        ownerName: 'Test Seller',
        mobileNumber: TEST_MOBILE,
        tahsilId: tahsil._id,
        districtIds: districtId ? [districtId] : [],
        serviceTahsilIds: allTahsilIds,
        shopAddress: 'Shop 101, Test Market, Indore',
        pincode: tahsil.pincodes?.[0] || '452001',
        status: 'Active',
        rating: 5.0,
        ratingCount: 10,
        customerLimit: 1000,
        commissionRate: 0,
        settings: {
          enableDelivery: true,
          deliveryCharge: 0,
          freeDeliveryAbove: 0,
          allowCashOnDelivery: true,
        },
      });
      logger.info(`Test seller created: ${seller.shopName} (Mobile: ${TEST_MOBILE})`);
    } else {
      seller.status = 'Active';
      if (!seller.serviceTahsilIds || !seller.serviceTahsilIds.length) {
        seller.serviceTahsilIds = allTahsilIds;
      }
      await seller.save();
      logger.info(`Test seller updated: ${seller.shopName} (Mobile: ${TEST_MOBILE})`);
    }

    // 4. Products for test seller (if empty)
    const productCount = await Product.countDocuments({ sellerId: seller._id });
    if (productCount === 0) {
      const categories = await Category.find();
      const subCategories = await SubCategory.find();

      const catMap = Object.fromEntries(categories.map((c) => [c.name, c._id]));
      const subMap = Object.fromEntries(subCategories.map((s) => [s.name, s._id]));

      const demoProducts = [
        {
          name: 'Test Running Shoes',
          category: 'Footwear',
          sub: 'Casual Shoes',
          price: 499,
          mrp: 999,
          stock: 100,
          gstRate: 0,
        },
        {
          name: 'Test Cotton T-Shirt',
          category: 'Fashion',
          sub: 'T-Shirts',
          price: 299,
          mrp: 599,
          stock: 100,
          gstRate: 0,
        },
        {
          name: 'Test Grocery Pack',
          category: 'Grocery',
          sub: 'Staples',
          price: 199,
          mrp: 299,
          stock: 100,
          gstRate: 0,
        },
      ];

      for (let i = 0; i < demoProducts.length; i++) {
        const dp = demoProducts[i];
        const categoryId = catMap[dp.category] || categories[0]?._id;
        const subCategoryId = subMap[dp.sub] || subCategories[0]?._id;
        if (categoryId) {
          await Product.create({
            sellerId: seller._id,
            name: dp.name,
            categoryId,
            subCategoryId,
            sellingPrice: dp.price,
            costPrice: Math.round(dp.price * 0.7),
            mrp: dp.mrp,
            stock: dp.stock,
            gstRate: dp.gstRate,
            sku: `TEST-${String(i + 1).padStart(3, '0')}`,
            description: `${dp.name} for live testing`,
            isActive: true,
          });
        }
      }
      logger.info('Test products created for Prime Test Store');
    }

    // 5. User
    let user = await User.findOne({ mobileNumber: TEST_MOBILE });
    if (!user) {
      user = await User.create({
        name: 'Test User',
        mobileNumber: TEST_MOBILE,
        email: 'testuser7802@primenear.in',
        tahsilId: tahsil._id,
        status: 'Active',
        addresses: [
          {
            type: 'Home',
            name: 'Test User',
            fullAddress: '101, Test Colony, Main Road',
            city: 'Indore',
            taluka: 'Indore',
            district: 'Indore',
            state: 'Madhya Pradesh',
            zipCode: tahsil.pincodes?.[0] || '452001',
            phoneNumber: TEST_MOBILE,
            isDefault: true,
          },
        ],
      });
      logger.info(`Test user created: ${user.name} (Mobile: ${TEST_MOBILE})`);
    } else {
      user.status = 'Active';
      if (!user.addresses || !user.addresses.length) {
        user.addresses = [
          {
            type: 'Home',
            name: 'Test User',
            fullAddress: '101, Test Colony, Main Road',
            city: 'Indore',
            taluka: 'Indore',
            district: 'Indore',
            state: 'Madhya Pradesh',
            zipCode: tahsil.pincodes?.[0] || '452001',
            phoneNumber: TEST_MOBILE,
            isDefault: true,
          },
        ];
      }
      await user.save();
      logger.info(`Test user updated: ${user.name} (Mobile: ${TEST_MOBILE})`);
    }

    // 6. Customer links
    const allActiveSellers = await Seller.find({ status: 'Active' });
    for (const s of allActiveSellers) {
      await Customer.findOneAndUpdate(
        { sellerId: s._id, userId: user._id },
        {
          $setOnInsert: {
            sellerId: s._id,
            userId: user._id,
            mobileNumber: TEST_MOBILE,
            name: user.name,
            linkedBy: 'Seller',
          },
        },
        { upsert: true }
      );
    }
    logger.info(`Customer links ensured for user ${TEST_MOBILE}`);
  } catch (err) {
    logger.error(`Error in seedTestAccount: ${err.message}`, { stack: err.stack });
  }
}

if (require.main === module) {
  const config = require('../config');
  const { connectDB, disconnectDB } = require('../config/db');
  (async () => {
    await connectDB(config.mongoUri);
    await seedTestAccount();
    await disconnectDB();
    process.exit(0);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seedTestAccount };

