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
  categories?: (string | { _id: string; id: string; name: string; slug: string })[];
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
  averageRating?: number;
  totalReviews?: number;
  preparationTimeMinutes?: number;
  preparationTime?: number;
  stockQuantity?: number;
  lowStockThreshold?: number;
  isSoldOut?: boolean;
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
  | "rider_accepted"
  | "picked_up"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "expired"
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "RIDER_ACCEPTED"
  | "PICKED_UP"
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
  | "REFUND_PENDING"
  | "REFUND_FAILED"
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
  dateStr?: string;
  slotKey?: string;
  label?: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  remainingCapacity?: number;
  scheduleSource?: "WEEKLY" | "DATE_ADDITION" | "DATE_OVERRIDE" | "CUSTOM" | string;
  isActive: boolean;
  isAvailable?: boolean;
}

export interface DeliverySlotsResult {
  slots: DeliverySlot[];
  state: "AVAILABLE" | "NO_SCHEDULE" | "ALL_FULL" | "BOOKING_CLOSED" | "DELIVERY_CLOSED" | "UNSERVICEABLE" | string;
  message: string;
  serviceable: boolean;
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
  minimumOrderValue?: number;
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

export type TicketCategory =
  | "ORDER_ISSUE"
  | "PAYMENT_ISSUE"
  | "DELIVERY_ISSUE"
  | "MISSING_INCORRECT_ITEM"
  | "FOOD_QUALITY"
  | "REFUND_REQUEST"
  | "ACCOUNT_ISSUE"
  | "OTHER";

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING_FOR_CUSTOMER" | "RESOLVED" | "CLOSED";

export interface TicketAttachment {
  url: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface TicketMessage {
  id?: string;
  _id?: string;
  senderName?: string;
  senderRole: "CUSTOMER" | "ADMIN" | "SYSTEM";
  message: string;
  attachments?: TicketAttachment[];
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  _id?: string;
  ticketNumber: string;
  category: TicketCategory;
  subject: string;
  description: string;
  attachments?: TicketAttachment[];
  status: TicketStatus;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  order?: {
    id: string;
    orderNumber: string;
    orderStatus: string;
    grandTotal: number;
    createdAt?: string;
    itemCount?: number;
  } | null;
  messages?: TicketMessage[];
  messageCount?: number;
  lastMessageSnippet?: string;
  lastMessageAt?: string;
  createdAt: string;
}

export interface SupportFaq {
  id: string;
  _id?: string;
  question: string;
  answer: string;
  category: string;
  helpfulCount?: number;
}

export interface SupportConfig {
  email: string;
  phone: string;
  whatsapp: string | null;
  isWhatsAppConfigured: boolean;
  address: string;
  operatingHours: string;
  categories: Array<{ key: TicketCategory; label: string; description: string }>;
}

export interface ReviewImage {
  url: string;
  publicId?: string | null;
}

export interface CustomerReview {
  id: string;
  authorName: string;
  rating: number;
  title?: string;
  comment: string;
  images: ReviewImage[];
  isVerifiedPurchase: boolean;
  createdAt: string;
}

export interface ReviewDistribution {
  5: number;
  4: number;
  3: number;
  2: number;
  1: number;
}

export interface ReviewSummary {
  productId: string;
  totalReviews: number;
  averageRating: number;
  distribution: ReviewDistribution;
}

export interface ReviewEligibilityResponse {
  productId: string;
  productName: string;
  productSlug: string;
  isEligible: boolean;
  canReview: boolean;
  eligibleOrders: Array<{
    id: string;
    orderNumber: string;
    deliveredAt: string;
  }>;
  existingReviews: Array<{
    id: string;
    orderId: string;
    rating: number;
    title?: string;
    comment: string;
    images: ReviewImage[];
    createdAt: string;
  }>;
}

export interface SubmitReviewPayload {
  productId: string;
  orderId: string;
  rating: number;
  title?: string;
  comment: string;
  images?: ReviewImage[];
}

