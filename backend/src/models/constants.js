// Enumerations shared across the whole platform (user, seller and admin apps).
module.exports = {
  ADMIN_ROLES: ['SuperAdmin', 'Admin', 'SupportAdmin'],
  ACCOUNT_STATUS: ['Active', 'Blocked', 'Deleted'],
  GST_RATES: [0, 5, 12, 18, 28],
  ORDER_STATUS: ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Returned'],
  // Allowed forward transitions in the normal order flow
  ORDER_FLOW: {
    Pending: ['Confirmed', 'Cancelled'],
    Confirmed: ['Packed', 'Cancelled'],
    Packed: ['Shipped', 'Cancelled'],
    Shipped: ['Delivered', 'Cancelled'],
    Delivered: ['Returned'],
    Cancelled: [],
    Returned: [],
  },
  PAYMENT_METHODS: ['Online', 'Cash'],
  PAYMENT_STATUS: ['Pending', 'Completed', 'Failed', 'Refunded', 'PartiallyRefunded'],
  ORDER_SOURCE: ['Online', 'POS'],
  PAYOUT_STATUS: ['Pending', 'Processing', 'Completed', 'Failed', 'Rejected'],
  PAYOUT_METHODS: ['BankTransfer', 'UPI', 'Cheque'],
  DISPUTE_STATUS: ['Open', 'InProgress', 'Resolved', 'Closed'],
  DISPUTE_PRIORITY: ['Low', 'Medium', 'High', 'Critical'],
  DISPUTE_CATEGORY: ['ProductQuality', 'LateDelivery', 'PaymentIssue', 'Fraud', 'Other'],
  CUSTOMER_TYPES: ['Retail', 'Wholesale'],
  REPORT_TYPES: ['Revenue', 'Orders', 'Users', 'Sellers', 'Products', 'Disputes', 'Payouts'],
  REPORT_FORMATS: ['PDF', 'Excel', 'CSV'],
  REPORT_FREQUENCY: ['Daily', 'Weekly', 'Monthly'],
};
