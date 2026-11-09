const whatsappOtp = require('../services/whatsappOtp.service');
const { User, Seller, Customer, LoginHistory } = require('../models');
const { signUserToken } = require('../middleware/userAuth');
const { linkedSellers } = require('../services/shop-access.service');
const ApiError = require('../utils/ApiError');

/**
 * POST /auth/otp/send
 * Body: { phone }
 * Response: 200 { success: true, expiresInSeconds: 300 }
 */
async function send(req, res, next) {
  try {
    const rawPhone = req.body.phone || req.body.mobileNumber;
    if (!rawPhone) {
      throw ApiError.badRequest('Phone number is required.');
    }

    const result = await whatsappOtp.sendOtp(rawPhone);
    return res.status(200).json({
      success: true,
      expiresInSeconds: result.expiresInSeconds,
      data: {
        expiresInSeconds: result.expiresInSeconds,
        resendIn: 60,
      },
    });
  } catch (err) {
    if (err.statusCode === 502 || err.status === 502) {
      return res.status(502).json({
        success: false,
        message: err.message || 'Failed to send OTP via WhatsApp. Please try again later.',
      });
    }
    next(err);
  }
}

/**
 * POST /auth/otp/verify
 * Body: { phone, otp }
 * Response: 200 with JWT session and user data
 */
async function verify(req, res, next) {
  try {
    const rawPhone = req.body.phone || req.body.mobileNumber;
    const rawOtp = req.body.otp || req.body.code;

    if (!rawPhone || !rawOtp) {
      throw ApiError.badRequest('Phone and OTP are required.');
    }

    const verified = await whatsappOtp.verifyOtp(rawPhone, rawOtp);
    const mobile10 = verified.mobileNumber;

    // Continue existing login / registration logic (issue JWT/session)
    let user = await User.findOne({ mobileNumber: mobile10 });

    if (!user) {
      // Find default active shop to link customer
      const defaultSeller = await Seller.findOne({ status: 'Active' }).sort({ createdAt: 1 });
      user = await User.create({
        mobileNumber: mobile10,
        name: 'Customer',
        currentActiveSellerId: defaultSeller?._id || null,
        status: 'Active',
      });
      if (defaultSeller) {
        await Customer.create({
          userId: user._id,
          sellerId: defaultSeller._id,
          mobileNumber: mobile10,
          customerType: 'Retail',
        });
      }
    } else {
      if (user.status === 'Blocked') {
        throw ApiError.forbidden('Your account is blocked. Please contact support.');
      }
      if (user.status === 'Deleted') {
        user.status = 'Active';
      }
    }

    let sellers = await linkedSellers(user._id);
    if (!sellers.length) {
      const defaultSeller = await Seller.findOne({ status: 'Active' }).sort({ createdAt: 1 });
      if (defaultSeller) {
        await Customer.findOneAndUpdate(
          { userId: user._id, sellerId: defaultSeller._id },
          { userId: user._id, sellerId: defaultSeller._id, mobileNumber: mobile10, customerType: 'Retail' },
          { upsert: true }
        );
        sellers = await linkedSellers(user._id);
      }
    }

    if (sellers.length && !sellers.some((s) => String(s._id) === String(user.currentActiveSellerId))) {
      user.currentActiveSellerId = sellers[0]._id;
    }

    user.lastLogin = new Date();
    await user.save();

    await LoginHistory.create({
      principalType: 'User',
      principalId: user._id,
      identifier: mobile10,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'Success',
    });

    const token = signUserToken(user);

    const payload = {
      token,
      user,
      sellers,
      activeSellerId: user.currentActiveSellerId,
    };

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      ...payload,
      data: payload,
    });
  } catch (err) {
    if (err.statusCode === 502 || err.status === 502) {
      return res.status(502).json({
        success: false,
        message: err.message || 'Failed to send OTP via WhatsApp. Please try again later.',
      });
    }
    next(err);
  }
}

module.exports = {
  send,
  verify,
};

