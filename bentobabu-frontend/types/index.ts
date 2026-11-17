export type DietaryType =
  | "vegetarian"
  | "non-vegetarian"
  | "vegan"
  | "egg"
  | "VEG"
  | "NON_VEG"
  | "VEGAN";

export interface NutritionalInfo {
  calories: number;
  protein: number; // in grams
  carbs: number; // in grams
  fats: number; // in grams
  fiber?: number; // in grams
}

export interface Category {
  id: string;
  _id?: string;
  name: string;
  slug: string;
  description: string;
  tagline?: string;
  image: string;
  featured?: boolean;
  isActive?: boolean;
  itemCount?: number;
}

export interface ProductMediaImage {
  publicId: string;
  secureUrl: string;
  format?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
}

export interface ProductVideo {
  secureUrl: string;
  objectKey: string;
  mimeType: string;
  sizeBytes?: number;
  durationSeconds?: number;
  posterUrl?: string | null;
  mediaId?: string;
}

export interface Product {
  id: string;
  _id?: string;
  slug: string;
  name: string;
  description: string;
  detailedDescription?: string;
  price: number;
  originalPrice?: number;
  discountPrice?: number | null;
  category?: string | { _id: string; id: string; name: string; slug: string };
  categoryIds: string[];
  dietary: DietaryType;
  dietaryTags?: string[];
  mealTypes?: string[];
  imageUrl: string;
  images?: string[];
  galleryImages?: string[];
  imagesData?: ProductMediaImage[];
  video?: ProductVideo;
  isAvailable: boolean;
  isBestseller?: boolean;
  isFeatured?: boolean;
  isChefSpecial?: boolean;
  preparationTimeMinutes?: number;
  preparationTime?: number;
  stockQuantity?: number;
  servingSize?: string;
  nutritionalInfo?: NutritionalInfo;
  nutrition?: NutritionalInfo;
  ingredients?: string[];
  allergens?: string[];
  tags?: string[];
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface CartState {
  items: CartItem[];
  appliedCoupon: Coupon | null;
  deliverySlot?: string;
  deliveryNotes?: string;
}

export interface Coupon {
  id?: string;
  _id?: string;
  code: string;
  discountType: "percentage" | "flat" | "PERCENTAGE" | "FIXED";
  discountValue: number;
  maximumDiscount?: number;
  minOrderValue?: number;
  minimumOrderAmount?: number;
  description: string;
}

export interface Address {
  id: string;
  _id?: string;
  name?: string;
  fullName: string;
  phone: string;
  type?: "home" | "work" | "other";
  addressType: "HOME" | "WORK" | "OTHER" | "home" | "work" | "other";
  houseNo?: string;
  street?: string;
  addressLine: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault?: boolean;
}

export interface User {
  id: string;
  _id?: string;
  name: string;
  email: string;
  phone: string;
  role?: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  notificationPreferences?: {
    email: boolean;
    whatsapp: boolean;
    inApp: boolean;
  };
  createdAt?: string;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "expired"
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "EXPIRED";

export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "refunded"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | "COD_PENDING";

export interface OrderItem {
  productId: string;
  product?: string | Product;
  productName: string;
  image?: string;
  productImage?: string;
  price: number;
  unitPrice?: number;
  quantity: number;
  subtotal?: number;
  dietary?: DietaryType;
}

export interface Order {
  id: string;
  _id?: string;
  orderNumber?: string;
  createdAt: string;
  items: OrderItem[];
  subtotal: number;
  itemTotal?: number;
  discount: number;
  couponDiscount?: number;
  deliveryFee: number;
  deliveryCharge?: number;
  tax: number;
  taxAmount?: number;
  total: number;
  grandTotal?: number;
  status: OrderStatus;
  orderStatus?: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: "razorpay" | "cod" | "RAZORPAY" | "COD";
  deliveryAddress: Address;
  deliveryZone?: string | DeliveryZone;
  deliverySlot?: string | DeliverySlot;
  coupon?: any;
  deliveryNotes?: string;
  deliveryOtp?: string | null;
  cancellationReason?: string | null;
  statusHistory?: Array<{
    status: string;
    changedAt: string;
    note?: string;
  }>;
  razorpayOrderId?: string;
  estimatedDelivery?: string;
}

export interface DeliveryZone {
  id?: string;
  _id?: string;
  name: string;
  pincodes: string[];
  deliveryFee: number;
  freeDeliveryThreshold?: number;
  minimumOrderAmount: number;
  estimatedDeliveryTime: string;
  isActive: boolean;
}

export interface DeliverySlot {
  id: string;
  _id?: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  isActive: boolean;
}

export interface CheckoutSummary {
  itemTotal: number;
  deliveryCharge: number;
  couponDiscount: number;
  taxAmount: number;
  grandTotal: number;
  deliveryZone?: DeliveryZone;
  deliverySlot?: DeliverySlot;
  coupon?: Coupon;
}

export interface Notification {
  id: string;
  _id?: string;
  channel: "EMAIL" | "WHATSAPP" | "IN_APP";
  eventType: string;
  subject: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ProductFilterOptions {
  categoryId?: string;
  category?: string;
  search?: string;
  date?: string;
  dietary?: DietaryType[];
  dietaryTags?: string;
  mealTypes?: string;
  maxPrice?: number;
  minPrice?: number;
  minProtein?: number;
  sortBy?: "popularity" | "price-asc" | "price-desc" | "newest" | string;
  page?: number;
  limit?: number;
}

export interface CheckoutFormData {
  fullName: string;
  email: string;
  phone: string;
  addressId?: string;
  houseNo: string;
  street: string;
  addressLine?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  addressType: "home" | "work" | "other" | "HOME" | "WORK" | "OTHER";
  deliverySlotId?: string;
  deliverySlot?: string;
  deliveryNotes?: string;
  paymentMethod: "razorpay" | "cod" | "RAZORPAY" | "COD";
  couponCode?: string;
}

export interface VideoContent {
  _id: string;
  id?: string;
  title: string;
  slug: string;
  description?: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  thumbnailUrl?: string;
  category: string;
  contentType: "Recipes" | "Food Preparation" | "Nutrition Tips" | "Meal Ideas" | string;
  preparationMethods?: string[];
  dietaryTags?: string[];
  mealType?: string[];
  relatedProduct?: string | Product;
  isFeatured: boolean;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt?: string | null;
  createdBy?: string | { _id: string; name: string; email: string };
  embedUrl?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface VideoFilterOptions {
  category?: string;
  contentType?: string;
  preparationMethod?: string;
  dietaryTag?: string;
  search?: string;
  isFeatured?: boolean | string;
  page?: number;
  limit?: number;
}
