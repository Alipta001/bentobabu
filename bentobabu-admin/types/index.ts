export type DietaryType = "vegetarian" | "non-vegetarian" | "vegan" | "egg";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready_for_dispatch"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "failed";

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export interface NutritionalInfo {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber?: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  tagline?: string;
  image: string;
  isActive: boolean;
  itemCount?: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  detailedDescription?: string;
  price: number;
  originalPrice?: number;
  costPrice?: number;
  categoryIds: string[];
  dietary: DietaryType;
  imageUrl: string;
  galleryImages?: string[];
  isAvailable: boolean;
  isBestseller?: boolean;
  isDailyMenu?: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  sku: string;
  preparationTimeMinutes?: number;
  servingSize?: string;
  nutritionalInfo?: NutritionalInfo;
  ingredients?: string[];
  allergens?: string[];
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  productImage: string;
  price: number;
  quantity: number;
  dietary?: DietaryType;
}

export interface Order {
  id: string;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: "razorpay" | "cod";
  deliveryAddress: {
    houseNo: string;
    street: string;
    landmark?: string;
    city: string;
    state: string;
    pincode: string;
    type: "home" | "work" | "other";
  };
  deliverySlot?: string;
  deliveryNotes?: string;
  cancellationReason?: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  totalOrders: number;
  totalSpent: number;
  createdAt: string;
  isBlocked?: boolean;
  lastOrderDate?: string;
}

export interface KPISummary {
  totalRevenue: number;
  todayRevenue: number;
  totalOrders: number;
  todayOrders: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalCustomers: number;
  totalProducts: number;
  lowStockCount: number;
}

export interface RevenueAnalytics {
  dailyRevenue: { date: string; revenue: number; orders: number }[];
  categoryRevenue: { category: string; revenue: number }[];
  bestsellers: { name: string; quantity: number; revenue: number }[];
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  customerName: string;
  amount: number;
  provider: "razorpay" | "cod";
  method: string;
  status: PaymentStatus;
  transactionRef?: string;
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: "percentage" | "flat";
  discountValue: number;
  minOrderValue: number;
  maxDiscount?: number;
  usageCount: number;
  usageLimit?: number;
  isActive: boolean;
  description: string;
  expiresAt: string;
}

export interface DeliveryZone {
  id: string;
  pincode: string;
  areaName: string;
  deliveryFee: number;
  minOrderValue: number;
  estimatedMinutes: string;
  isServiceable: boolean;
}

export interface Review {
  id: string;
  productName: string;
  customerName: string;
  rating: number; // 1-5
  comment: string;
  createdAt: string;
  isApproved: boolean;
}

export interface BusinessSettings {
  businessName: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  kitchenAddress: string;
  operatingHours: string;
  gstRatePercentage: number;
  freeDeliveryThreshold: number;
  isOrderingEnabled: boolean;
}

