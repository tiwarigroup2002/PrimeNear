const logger = require('../config/logger');
const { Admin, Seller, User, Customer, Product, Tahsil, District, Category, SubCategory } = require('../models');

async function seedTestAccount() {
  const USER_MOBILE = '7802807904';
  const USER_OTP = '2002';

  try {
    // 1. Admin Account
    let admin = await Admin.findOne({
      $or: [
        { mobileNumber: USER_MOBILE },
        { email: 'aashish.tiwari@primenear.in' },
        { email: '7802807904@primenear.in' },
        { email: 'admin.test@primenear.in' },
      ],
    }).select('+password');

    if (!admin) {
      admin = new Admin({
        email: 'aashish.tiwari@primenear.in',
        fullName: 'Aashish Tiwari',
        mobileNumber: USER_MOBILE,
        password: USER_OTP,
        role: 'SuperAdmin',
        isActive: true,
      });
      await admin.save();
      logger.info(`Super Admin ready: ${admin.email} (Mobile: ${USER_MOBILE})`);
    } else {
      admin.fullName = 'Aashish Tiwari';
      admin.email = 'aashish.tiwari@primenear.in';
      admin.mobileNumber = USER_MOBILE;
      admin.isActive = true;
      admin.isDeleted = false;
      admin.lockUntil = undefined;
      admin.loginAttempts = 0;
      admin.password = USER_OTP;
      await admin.save();
      logger.info(`Super Admin updated: ${admin.email} (Mobile: ${USER_MOBILE})`);
    }

    // 2. Tahsil & District
    let tahsil = await Tahsil.findOne({ name: 'Indore' });
    if (!tahsil) tahsil = await Tahsil.findOne();
    const allTahsils = await Tahsil.find();
    const allTahsilIds = allTahsils.map((t) => t._id);
    const districtId = tahsil?.districtId;

    if (!tahsil) {
      logger.warn('No tahsil found; skipping store seeding');
      return;
    }

    // 3. Store / Seller Account
    let seller = await Seller.findOne({
      $or: [{ mobileNumber: USER_MOBILE }, { shopName: 'Vardhman Lifestyle & Departmental Store' }],
    });

    const storeData = {
      shopName: 'Vardhman Lifestyle & Departmental Store',
      ownerName: 'Aashish Tiwari',
      mobileNumber: USER_MOBILE,
      tahsilId: tahsil._id,
      districtIds: districtId ? [districtId] : [],
      serviceTahsilIds: allTahsilIds,
      shopAddress: 'Shop 14-16, Ground Floor, Central Mall, RNT Marg, Indore',
      pincode: '452001',
      shopImage: 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?auto=format&fit=crop&w=800&q=80',
      status: 'Active',
      rating: 4.8,
      ratingCount: 156,
      customerLimit: 5000,
      commissionRate: 5,
      gstNumber: '23AABCV1234F1Z5',
      bankDetails: {
        accountHolder: 'Aashish Tiwari',
        accountNumber: '20485918374',
        ifscCode: 'SBIN0001234',
        bankName: 'State Bank of India',
      },
      settings: {
        enableDelivery: true,
        deliveryCharge: 30,
        freeDeliveryAbove: 499,
        allowCashOnDelivery: true,
      },
    };

    if (!seller) {
      seller = await Seller.create(storeData);
      logger.info(`Store created: ${seller.shopName} (Mobile: ${USER_MOBILE})`);
    } else {
      Object.assign(seller, storeData);
      await seller.save();
      logger.info(`Store updated: ${seller.shopName} (Mobile: ${USER_MOBILE})`);
    }

    // 4. Clean up any previous test products
    await Product.deleteMany({
      sellerId: seller._id,
      $or: [
        { sku: /^TEST-/ },
        { name: /test/i },
        { description: /test/i },
      ],
    });

    // 5. Authentic, Realistic Catalog Products
    const categories = await Category.find();
    const subCategories = await SubCategory.find();

    const catMap = Object.fromEntries(categories.map((c) => [c.name, c._id]));
    const subMap = Object.fromEntries(subCategories.map((s) => [s.name, s._id]));

    const catalog = [
      {
        name: "Men's Air Velocity Lightweight Running Shoes",
        category: 'Footwear',
        sub: 'Sports Shoes',
        sku: 'VRD-FTW-001',
        price: 1299,
        mrp: 2499,
        gstRate: 18,
        stock: 45,
        rating: 4.8,
        ratingCount: 68,
        images: [
          'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=800&q=80',
        ],
        description: 'Engineered for high performance and daily running, the Air Velocity shoes feature an ultra-breathable flyknit mesh upper and responsive EVA cushioning. The high-traction rubber outsole provides superior grip on roads, tracks, and treadmills.',
      },
      {
        name: 'Handcrafted Genuine Leather Oxford Brogue Shoes',
        category: 'Footwear',
        sub: 'Formal Shoes',
        sku: 'VRD-FTW-002',
        price: 1899,
        mrp: 3499,
        gstRate: 18,
        stock: 28,
        rating: 4.7,
        ratingCount: 42,
        images: [
          'https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1533867617858-e7b97e060509?auto=format&fit=crop&w=800&q=80',
        ],
        description: 'Handcrafted from full-grain genuine leather with classic wingtip brogue perforations. Fitted with high-density memory foam insoles for all-day comfort and anti-skid TPR outsoles. Ideal for corporate office wear and weddings.',
      },
      {
        name: 'Classic Canvas Low-Top Streetwear Sneakers',
        category: 'Footwear',
        sub: 'Casual Shoes',
        sku: 'VRD-FTW-003',
        price: 799,
        mrp: 1599,
        gstRate: 18,
        stock: 60,
        rating: 4.6,
        ratingCount: 95,
        images: [
          'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1560769629-975ec94e6a86?auto=format&fit=crop&w=800&q=80',
        ],
        description: 'Timeless low-top canvas sneakers featuring reinforced metal eyelets, vulcanized rubber midsoles, and waffle-tread outsoles. Breathable canvas keeps feet cool during everyday walks, college, or weekend outings.',
      },
      {
        name: 'Pure Combed Cotton Heavyweight Crewneck T-Shirt',
        category: 'Fashion',
        sub: 'T-Shirts',
        sku: 'VRD-FSH-001',
        price: 499,
        mrp: 999,
        gstRate: 5,
        stock: 85,
        rating: 4.9,
        ratingCount: 124,
        images: [
          'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=800&q=80',
        ],
        description: 'Crafted from 100% super combed cotton (240 GSM) with bio-washed fabric for ultimate softness. Features a ribbed lay-flat collar, double-stitched hem, and pre-shrunk fabric to retain shape after multiple machine washes.',
      },
      {
        name: 'Slim Fit Pure Linen Casual Long-Sleeve Shirt',
        category: 'Fashion',
        sub: 'Shirts',
        sku: 'VRD-FSH-002',
        price: 1199,
        mrp: 2299,
        gstRate: 5,
        stock: 35,
        rating: 4.7,
        ratingCount: 56,
        images: [
          'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=800&q=80',
        ],
        description: 'Woven from 100% European flax linen for lightweight breathability and effortless summer styling. Features a spread collar, curved shirttail hem, and mother-of-pearl buttons. Pairs seamlessly with chinos or denim.',
      },
      {
        name: 'Vintage Indigo Stretch Slim-Straight Denim Jeans',
        category: 'Fashion',
        sub: 'Jeans',
        sku: 'VRD-FSH-003',
        price: 1449,
        mrp: 2799,
        gstRate: 5,
        stock: 40,
        rating: 4.8,
        ratingCount: 83,
        images: [
          'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1582552938357-32b906df40cb?auto=format&fit=crop&w=800&q=80',
        ],
        description: 'Classic 5-pocket denim tailored in durable 12.5 oz ring-spun cotton infused with 2% elastane for flexible movement. Features antique brass hardware, reinforced belt loops, and authentic subtle hand-whisker fading on the thighs.',
      },
      {
        name: 'BassPro Wireless Noise-Cancelling Earbuds',
        category: 'Electronics',
        sub: 'Audio',
        sku: 'VRD-ELC-001',
        price: 1599,
        mrp: 3999,
        gstRate: 18,
        stock: 50,
        rating: 4.9,
        ratingCount: 158,
        images: [
          'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?auto=format&fit=crop&w=800&q=80',
        ],
        description: 'Premium true wireless earbuds featuring 10mm dynamic bass boost drivers, environmental noise cancellation (ENC) for crystal-clear calling, and Bluetooth 5.3 instant pairing. Up to 36 hours total battery life with fast USB-C charging.',
      },
      {
        name: 'Ultra-Compact 10000mAh 22.5W Fast Power Bank',
        category: 'Electronics',
        sub: 'Mobile Accessories',
        sku: 'VRD-ELC-002',
        price: 899,
        mrp: 1799,
        gstRate: 18,
        stock: 65,
        rating: 4.8,
        ratingCount: 110,
        images: [
          'https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&w=800&q=80',
        ],
        description: 'Pocket-sized high-capacity external battery with dual USB-A and bidirectional Type-C Power Delivery (PD 3.0) output. Charges smartphones up to 50% in 30 minutes. Built-in 9-layer circuit protection against short-circuits and overheating.',
      },
      {
        name: 'Royal Heritage Aged Long-Grain Basmati Rice (5 kg)',
        category: 'Grocery',
        sub: 'Staples',
        sku: 'VRD-GRC-001',
        price: 549,
        mrp: 699,
        gstRate: 0,
        stock: 120,
        rating: 4.9,
        ratingCount: 210,
        images: [
          'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1516684732162-798a0062be99?auto=format&fit=crop&w=800&q=80',
        ],
        description: 'Naturally aged for two years to develop an exquisite aroma and slender, elongated grains that double in length when cooked. Impurity-free with non-sticky texture, making it the perfect choice for biryani, pulao, and daily dining.',
      },
      {
        name: 'Premium Jumbo Roasted & Salted Cashews (500g)',
        category: 'Grocery',
        sub: 'Snacks',
        sku: 'VRD-GRC-002',
        price: 479,
        mrp: 649,
        gstRate: 5,
        stock: 90,
        rating: 4.8,
        ratingCount: 145,
        images: [
          'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?auto=format&fit=crop&w=800&q=80',
        ],
        description: 'Handpicked whole cashew nuts slow-roasted to golden crispness and lightly sprinkled with Himalayan pink salt. Packed in an airtight resealable zipper pouch to retain freshness and maximum crunchiness. Rich in healthy proteins.',
      },
    ];

    for (const item of catalog) {
      const categoryId = catMap[item.category] || categories[0]?._id;
      const subCategoryId = subMap[item.sub] || subCategories[0]?._id;
      if (!categoryId) continue;

      await Product.findOneAndUpdate(
        { sellerId: seller._id, sku: item.sku },
        {
          $set: {
            sellerId: seller._id,
            name: item.name,
            categoryId,
            subCategoryId,
            sellingPrice: item.price,
            costPrice: Math.round(item.price * 0.7),
            mrp: item.mrp,
            stock: item.stock,
            gstRate: item.gstRate,
            sku: item.sku,
            images: item.images,
            description: item.description,
            rating: item.rating,
            ratingCount: item.ratingCount,
            isActive: true,
            isDeleted: false,
          },
        },
        { upsert: true }
      );
    }
    logger.info(`Store catalog populated with ${catalog.length} high-quality products`);

    // 6. User Account
    let user = await User.findOne({ mobileNumber: USER_MOBILE });
    const userProfile = {
      name: 'Aashish Tiwari',
      mobileNumber: USER_MOBILE,
      email: 'aashish.tiwari@primenear.in',
      tahsilId: tahsil._id,
      status: 'Active',
      addresses: [
        {
          type: 'Home',
          name: 'Aashish Tiwari',
          fullAddress: 'Flat 402, Royal Residency, Velocity Mirage, AB Road',
          city: 'Indore',
          taluka: 'Indore',
          district: 'Indore',
          state: 'Madhya Pradesh',
          zipCode: '452010',
          phoneNumber: USER_MOBILE,
          isDefault: true,
        },
      ],
    };

    if (!user) {
      user = await User.create(userProfile);
      logger.info(`Customer profile ready: ${user.name} (Mobile: ${USER_MOBILE})`);
    } else {
      user.name = userProfile.name;
      user.email = userProfile.email;
      user.status = 'Active';
      user.addresses = userProfile.addresses;
      await user.save();
      logger.info(`Customer profile updated: ${user.name} (Mobile: ${USER_MOBILE})`);
    }

    // 7. Customer Links
    const allActiveSellers = await Seller.find({ status: 'Active' });
    for (const s of allActiveSellers) {
      await Customer.findOneAndUpdate(
        { sellerId: s._id, userId: user._id },
        {
          $set: {
            sellerId: s._id,
            userId: user._id,
            mobileNumber: USER_MOBILE,
            name: user.name,
            linkedBy: 'Seller',
          },
        },
        { upsert: true }
      );
    }
    logger.info(`Customer links verified for ${user.name}`);
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
