export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface Paged<T> {
  items: T[];
  totalCount: number;
  page: number;
  limit: number;
  pages: number;
  [extra: string]: any;
}

export type AdminRole = 'SuperAdmin' | 'Admin' | 'SupportAdmin';

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  mobileNumber?: string;
  profileImage?: string;
  role: AdminRole;
  permissions: string[];
  twoFactorEnabled: boolean;
  lastLogin?: string;
}

export interface LoginResult {
  token?: string;
  admin?: AdminUser;
  requires2fa?: boolean;
  tempToken?: string;
  mustSetup2fa?: boolean;
  passwordExpired?: boolean;
}

export interface Ref {
  _id: string;
  name?: string;
  shopName?: string;
  fullName?: string;
  mobileNumber?: string;
  [k: string]: any;
}

export interface District { _id: string; name: string; state?: string; isActive: boolean; tahsilCount?: number; sellerCount?: number; userCount?: number; }
export interface Tahsil { _id: string; name: string; districtId: Ref | string; district?: string; latitude: number; longitude: number; radius: number; isActive: boolean; sellerCount?: number; userCount?: number; }
export interface Category { _id: string; name: string; icon?: string; description?: string; isActive: boolean; sortOrder?: number; subCategoryCount?: number; productCount?: number; }
export interface SubCategory { _id: string; name: string; categoryId: Ref | string; icon?: string; isActive: boolean; productCount?: number; }

export interface BankDetails { accountHolder?: string; accountNumber?: string; ifscCode?: string; bankName?: string; }

export interface Seller {
  _id: string;
  shopName: string;
  ownerName: string;
  mobileNumber: string;
  email?: string;
  tahsilId: Ref | any;
  districtIds: (Ref | any)[];
  sellsAcrossDistricts?: boolean;
  shopAddress: string;
  shopImage?: string;
  gstNumber?: string;
  bankDetails?: BankDetails;
  upiId?: string;
  commissionRate: number | null;
  effectiveCommissionRate?: number;
  status: 'Active' | 'Blocked' | 'Deleted';
  blockReason?: string;
  rating: number;
  ratingCount: number;
  pendingDeduction?: number;
  settings?: any;
  createdAt: string;
  orders?: number;
  revenue?: number;
  customers?: number;
}

export interface OrderItem { productId: string; productName: string; image?: string; quantity: number; price: number; gstRate: number; gst: number; subtotal: number; }

export interface Order {
  _id: string;
  orderId: string;
  source: 'Online' | 'POS';
  sellerId: Ref | any;
  userId?: Ref | any;
  customerSnapshot?: { name?: string; mobileNumber?: string };
  items: OrderItem[];
  deliveryAddress?: any;
  subtotal: number;
  gstAmount: number;
  deliveryCharge: number;
  discount: number;
  finalAmount: number;
  refundedAmount: number;
  paymentMethod: 'Online' | 'Cash';
  paymentStatus: string;
  orderStatus: string;
  statusHistory?: { status: string; at: string; note?: string; byType?: string; byName?: string }[];
  notes?: { text: string; at: string; byType?: string; byName?: string }[];
  cancelReason?: string;
  commissionRate: number;
  commissionAmount: number;
  settlementStatus: string;
  payoutId?: any;
  razorpayPaymentId?: string;
  createdAt: string;
  deliveredAt?: string;
}
