export type DietaryType = "vegetarian" | "non-vegetarian" | "vegan" | "egg";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready_for_dispatch"
  | "rider_accepted"
  | "picked_up"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "failed";

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
  imageData?: ProductMediaImage;
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
  category?: string | { _id: string; id: string; name: string; slug: string };
  categories?: (string | { _id: string; id: string; name: string; slug: string })[];
  dietary: DietaryType;
  imageUrl: string;
  galleryImages?: string[];
  imagesData?: ProductMediaImage[];
  video?: ProductVideo;
  isAvailable: boolean;
  isActive?: boolean;
  isBestseller?: boolean;
  isDailyMenu?: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  sku: string;
  preparationTime?: number;
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

export type ReceiptStatus = "PENDING" | "GENERATING" | "STORED" | "FAILED";

export interface OrderReceiptMetadata {
  status: ReceiptStatus;
  storageProvider?: string;
  bucket?: string;
  objectKey?: string;
  fileName?: string;
  contentType?: string;
  fileSize?: number;
  generatedAt?: string;
  uploadedAt?: string;
  lastError?: string;
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
  receipt?: OrderReceiptMetadata;
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

export interface ReviewImage {
  url: string;
  publicId?: string | null;
}

export type ReviewStatus = "APPROVED" | "PENDING" | "REJECTED" | "HIDDEN";

export interface Review {
  id: string;
  rating: number; // 1-5
  title?: string;
  comment: string;
  images?: ReviewImage[];
  isVerifiedPurchase?: boolean;
  status?: ReviewStatus;
  isApproved: boolean;
  customer?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  } | null;
  product?: {
    id: string;
    name: string;
    slug: string;
    image?: string;
    price: number;
  } | null;
  order?: {
    id: string;
    orderNumber: string;
    grandTotal: number;
    orderDate?: string;
  } | null;
  moderation?: {
    moderatedBy?: {
      id: string;
      name: string;
      email: string;
    } | null;
    moderatedAt?: string | null;
    moderationNote?: string;
  };
  createdAt: string;
  updatedAt?: string;

  // Compatibility getters/fallbacks
  productName?: string;
  customerName?: string;
}

export interface AdminReviewStats {
  totalCount: number;
  approvedCount: number;
  hiddenCount: number;
  rejectedCount: number;
  pendingCount: number;
  averageRating: number;
  ratingBreakdown: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
}

export type FssaiStatus = "NOT_APPLIED" | "APPLICATION_SUBMITTED" | "APPROVED" | "EXPIRED" | "SUSPENDED";

export interface BusinessSettings {
  businessName: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  kitchenName?: string;
  kitchenLandmark?: string;
  kitchenAddress: string;
  kitchenPincode?: string;
  kitchenLatitude?: number;
  kitchenLongitude?: number;
  operatingHours: string;
  gstRatePercentage: number;
  freeDeliveryThreshold: number;
  deliveryChargeEnabled?: boolean;
  deliveryChargeAmount?: number;
  minimumOrderValue?: number;
  isOrderingEnabled: boolean;
  fssaiStatus?: FssaiStatus;
  fssaiNumber?: string;
  fssaiCertificateUrl?: string;
  gstin?: string;
  gstCertificateUrl?: string;
  websiteUrl?: string;
  businessAddress?: string;
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

export interface MediaAsset {
  _id: string;
  id?: string;
  provider: "CLOUDINARY" | "R2";
  mediaType: "IMAGE" | "VIDEO";
  publicId?: string;
  objectKey?: string;
  secureUrl: string;
  format?: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  status: "PENDING" | "UPLOADED" | "ACTIVE" | "FAILED" | "DELETED";
  createdAt: string;
}

export interface MediaUsageStats {
  cloudinary?: {
    storage?: { usage: number; limit?: number };
    bandwidth?: { usage: number; limit?: number };
    transformations?: { usage: number; limit?: number };
  };
  r2?: {
    objectCount: number;
    totalSizeBytes: number;
    estimatedGB: number;
    freeTierLimitGB: number;
    usagePercent: number;
    alertLevel: "NORMAL" | "INFO" | "HIGH" | "CRITICAL";
  };
  thresholds?: {
    info: number;
    high: number;
    critical: number;
  };
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
  relatedProduct?: string | { _id: string; id?: string; name: string; slug: string; price: number; images?: string[] };
  isFeatured: boolean;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt?: string | null;
  createdBy?: string | { _id: string; name: string; email: string };
  embedUrl?: string;
  createdAt: string;
  updatedAt?: string;
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

export type TicketStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_CUSTOMER"
  | "RESOLVED"
  | "CLOSED";

export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface TicketAttachment {
  url: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface AdminTicketMessage {
  id?: string;
  senderId?: string;
  senderName?: string;
  senderRole: "CUSTOMER" | "ADMIN" | "SYSTEM";
  message: string;
  attachments?: TicketAttachment[];
  isInternalNote: boolean;
  createdAt: string;
}

export interface AdminTicketListItem {
  id: string;
  ticketNumber: string;
  category: TicketCategory;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  customer: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  } | null;
  assignedTo: {
    id: string;
    name: string;
    email: string;
  } | null;
  order: {
    id: string;
    orderNumber: string;
    orderStatus: string;
    grandTotal: number;
  } | null;
  messageCount: number;
  internalNotesCount: number;
  lastMessageSnippet: string;
  lastMessageAt: string;
  createdAt: string;
}

export interface AdminTicketDetail {
  id: string;
  ticketNumber: string;
  category: TicketCategory;
  subject: string;
  description: string;
  attachments: TicketAttachment[];
  status: TicketStatus;
  priority: TicketPriority;
  customer: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    isActive?: boolean;
    createdAt?: string;
  } | null;
  assignedTo: {
    id: string;
    name: string;
    email: string;
  } | null;
  order: {
    id: string;
    orderNumber: string;
    orderStatus: string;
    paymentStatus?: string;
    paymentMethod?: string;
    grandTotal: number;
    createdAt: string;
    deliveryAddress?: {
      street?: string;
      city?: string;
      state?: string;
      postalCode?: string;
    };
    items?: Array<{
      productName: string;
      quantity: number;
      price: number;
      subtotal: number;
    }>;
  } | null;
  messages: AdminTicketMessage[];
  resolutionNote?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  lastMessageAt: string;
}

export interface SupportStats {
  total: number;
  open: number;
  inProgress: number;
  waitingForCustomer: number;
  resolved: number;
  closed: number;
}

export interface AdminFaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  isPublished: boolean;
  orderIndex: number;
  helpfulCount?: number;
  createdAt: string;
}



// ==========================================
// BUSINESS INTELLIGENCE & ANALYTICS TYPES
// ==========================================

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "custom";

export interface KpiCardData {
  value: number;
  prevValue: number;
  growth: number;
  text: string;
  hasHistorical: boolean;
}

export interface DashboardOverviewResponse {
  period: string;
  startDate: string;
  endDate: string;
  kpis: {
    totalRevenue: KpiCardData;
    totalOrders: KpiCardData;
    completedOrders: KpiCardData;
    averageOrderValue: KpiCardData;
    totalCustomers: KpiCardData;
    newCustomers: KpiCardData;
    activeCustomers: KpiCardData;
    cancellationRate: KpiCardData;
  };
  operations: {
    pendingOrders: number;
    confirmedOrders: number;
    preparingOrders: number;
    readyForDispatchOrders: number;
    outForDeliveryOrders: number;
    activeProductsCount: number;
    lowStockCount: number;
  };
}

export interface DashboardRevenueResponse {
  period: string;
  startDate: string;
  endDate: string;
  summary: {
    totalRevenue: number;
    grossSales: number;
    totalPaidOrders: number;
    averageOrderValue: number;
    breakdown: {
      itemSubtotal: number;
      deliveryCharges: number;
      discounts: number;
      taxes: number;
      actualCollectedAmount: number;
      refunds: number;
    };
  };
  timeline: Array<{
    date: string;
    revenue: number;
    paidOrdersCount: number;
    discounts: number;
    deliveryFees: number;
    taxes: number;
    refunds: number;
  }>;
}

export interface DashboardOrdersResponse {
  period: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  cancellationRate: number;
  statusBreakdown: Array<{ status: string; count: number }>;
  cancellationReasons: Array<{ reason: string; count: number }>;
  dailyTimeline: Array<{
    date: string;
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    pendingOrders: number;
  }>;
}

export interface DashboardProductsResponse {
  period: string;
  totalItemSalesRevenue: number;
  topSellingProducts: Array<{
    productId: string;
    name: string;
    image: string;
    unitsSold: number;
    orderCount: number;
    grossSales: number;
    contributionPercentage: number;
  }>;
  leastSellingProducts: Array<{
    productId: string;
    name: string;
    categoryName: string;
    image: string;
    price: number;
    stockQuantity: number;
    unitsSold: number;
    grossSales: number;
    orderCount: number;
  }>;
  categoryPerformance: Array<{
    categoryId: string;
    name: string;
    orders: number;
    unitsSold: number;
    revenue: number;
    contributionPercentage: number;
  }>;
}

export interface DashboardCustomersResponse {
  period: string;
  totalCustomers: number;
  purchasingCustomers: number;
  newRegistrationsInPeriod: number;
  firstTimePurchasersInPeriod: number;
  repeatPurchaseRate: number;
  segmentation: {
    newCustomers: number;
    repeatCustomers: number;
    highValueCustomers: number;
    inactiveCustomers: number;
  };
  topCustomers: Array<{
    userId: string;
    name: string;
    email: string;
    phone: string;
    orders: number;
    totalSpent: number;
    averageOrderValue: number;
    lastOrderDate: string;
  }>;
}

export interface DashboardLocationsResponse {
  period: string;
  serviceableLocations: Array<{
    pincode: string;
    city: string;
    state: string;
    orderCount: number;
    totalRevenue: number;
    averageOrderValue: number;
  }>;
  unservedDemand: Array<{
    pincode: string;
    locality: string;
    city: string;
    votesCount: number;
    status: string;
  }>;
}

export interface DashboardPaymentsResponse {
  period: string;
  statusBreakdown: Record<string, { count: number; amount: number }>;
  methodDistribution: Array<{ method: string; count: number; amount: number }>;
  refunds: { count: number; amount: number };
}

export interface DashboardDeliveryResponse {
  period: string;
  fleet: { total: number; activeOnline: number };
  ordersQueue: {
    awaitingAssignment: number;
    inTransit: number;
    deliveredInPeriod: number;
  };
  avgDeliveryMinutes: number;
}

export interface DashboardPeakHoursResponse {
  period: string;
  hourlyVelocity: Array<{ hour: number; label: string; orders: number; revenue: number }>;
  dayOfWeekVelocity: Array<{ dayNum: number; day: string; orders: number; revenue: number }>;
}

export interface ServiceExpansionSummaryResponse {
  totalVotes: number;
  uniquePincodesCount: number;
  newVotesInPeriod: number;
  periodDays: number;
  topRequestedArea: {
    pincode: string;
    locality: string;
    city: string;
    state: string;
    votes: number;
    status: string;
  } | null;
}

export interface ServiceExpansionLocationItem {
  rank: number;
  pincode: string;
  locality: string;
  city: string;
  state: string;
  votes: number;
  status: "NEW" | "UNDER_CONSIDERATION" | "PLANNED" | "LAUNCHED" | "REJECTED";
  internalNotes?: string;
  firstVotedAt?: string;
  lastVotedAt?: string;
}

export interface ServiceExpansionLocationsResponse {
  locations: ServiceExpansionLocationItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}
