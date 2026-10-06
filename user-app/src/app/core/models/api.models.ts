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

export interface Address {
  _id: string;
  type: 'Home' | 'Work' | 'Other';
  name?: string;
  fullAddress: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phoneNumber?: string;
  latitude?: number;
  longitude?: number;
  isDefault: boolean;
}

export interface User {
  _id: string;
  mobileNumber: string;
  name?: string;
  email?: string;
  profileImage?: string;
  gender?: string;
  dateOfBirth?: string;
  addresses: Address[];
  preferences: { language: string; theme: string; pushNotifications: boolean; emailNotifications: boolean; smsNotifications: boolean; whatsappNotifications: boolean };
  currentActiveSellerId?: string;
  tahsilId?: any;
  lastLocation?: { latitude: number; longitude: number };
}

export interface Shop {
  _id: string;
  shopName: string;
  ownerName?: string;
  shopImage?: string;
  shopAddress?: string;
  rating: number;
  ratingCount: number;
  tahsil?: string;
  tahsilId?: any;
  mobileNumber?: string;
  delivery?: boolean;
  deliveryCharge?: number;
  freeDeliveryAbove?: number;
  cod?: boolean;
}

export interface Product {
  _id: string;
  name: string;
  description?: string;
  images: string[];
  videos?: string[];
  mrp?: number;
  sellingPrice: number;
  gstRate: number;
  gstAmount: number;
  finalPrice: number;
  stock: number;
  rating: number;
  ratingCount: number;
  soldCount: number;
  categoryId?: any;
  subCategoryId?: any;
  sellerId: string;
  inStock: boolean;
  inWishlist: boolean;
  discountPercent: number;
  available?: boolean;
  inCart?: number;
}

export interface CartLine {
  productId: string;
  name: string;
  image?: string;
  quantity: number;
  price: number;
  mrp?: number;
  gstRate: number;
  gstAmount: number;
  finalPrice: number;
  lineTotal: number;
  stock: number;
  problem: string | null;
}

export interface CartData {
  sellerId?: string;
  shopName?: string;
  items: CartLine[];
  options: { delivery: boolean; deliveryCharge: number; freeDeliveryAbove: number; cod: boolean; online: boolean } | null;
  totals: { itemCount: number; subtotal: number; gst: number; itemsTotal: number; deliveryCharge: number; total: number; savings: number };
  canCheckout: boolean;
  cartCleared?: boolean;
}
