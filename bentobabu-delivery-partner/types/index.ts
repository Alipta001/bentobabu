export type UserRole = "CUSTOMER" | "ADMIN" | "KITCHEN" | "DELIVERY";

export type AccountStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
export type AvailabilityStatus = "ONLINE" | "OFFLINE" | "BUSY";
export type ConnectionStatus = "CONNECTED" | "DISCONNECTED";
export type LocationFreshness = "LIVE" | "LAST_KNOWN" | "NONE";

export interface DeliveryPartnerPresence {
  id?: string;
  user: string;
  application?: string | null;
  accountStatus: AccountStatus;
  availabilityStatus: AvailabilityStatus;
  intendedAvailability: "ONLINE" | "OFFLINE";
  currentOrderId?: string | null;
  lastHeartbeat?: string | null;
  connectionStatus?: ConnectionStatus;
  locationFreshness?: LocationFreshness;
  lastLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
    batteryLevel?: number | null;
    updatedAt?: string | null;
  } | null;
}

export interface User {
  id: string;
  _id?: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  profileImage?: string | null;
  notificationPreferences?: {
    email: boolean;
    whatsapp: boolean;
    inApp: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
}

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export type PaymentMethod = "RAZORPAY" | "COD";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "COD_PENDING";

export interface OrderItem {
  product: string | { _id: string; name: string; imageUrl?: string };
  productName: string;
  image?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface DeliveryAddress {
  fullName: string;
  phone: string;
  addressLine: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  addressType?: "HOME" | "WORK" | "OTHER";
}

export interface Order {
  id: string;
  _id: string;
  orderNumber: string;
  user: string | { _id: string; name: string; phone: string; email?: string };
  items: OrderItem[];
  deliveryAddress: DeliveryAddress;
  deliveryZone?: {
    _id: string;
    name: string;
    estimatedDeliveryMinutes?: number;
  };
  deliverySlot?: {
    _id: string;
    label?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
  };
  itemTotal: number;
  deliveryCharge: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  assignedDeliveryPartner?: string | User | null;
  deliveryOtp?: string; // Only present in customer response, omitted for delivery agent
  failedOtpAttempts?: number;
  cancellationReason?: string | null;
  statusHistory?: Array<{
    status: OrderStatus;
    changedBy?: string | User;
    changedAt: string;
    note?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryOrderListResponse {
  success: boolean;
  count: number;
  total: number;
  page: number;
  totalPages: number;
  data: Order[];
}

export interface NotificationItem {
  _id: string;
  id?: string;
  user: string;
  channel: "EMAIL" | "WHATSAPP" | "IN_APP";
  eventType: string;
  subject: string;
  message: string;
  isRead: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface EarningsStats {
  todayEarnings: number;
  todayDeliveries: number;
  weeklyEarnings: number;
  weeklyDeliveries: number;
  monthlyEarnings: number;
  monthlyDeliveries: number;
  totalEarnings: number;
  totalDeliveries: number;
  averageEarningsPerDelivery: number;
  transactions: Array<{
    orderId: string;
    orderNumber: string;
    deliveredAt: string;
    amount: number;
    deliveryFee: number;
    incentive: number;
    paymentMethod: PaymentMethod;
  }>;
}

export interface DeliveryFilterOptions {
  status?: OrderStatus | "ALL";
  search?: string;
  page?: number;
  limit?: number;
  date?: string;
}

export type DeliveryVehicleType = "BICYCLE" | "MOTORCYCLE" | "SCOOTER" | "ELECTRIC_VEHICLE";

export type DeliveryApplicationStatus =
  | "PENDING_VERIFICATION"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "CORRECTIONS_REQUESTED"
  | "SUSPENDED";

export interface DocumentItem {
  secureUrl: string;
  publicId?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt?: string;
}

export interface DeliveryApplicationPersonalInfo {
  fullName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  password?: string;
}

export interface DeliveryApplicationAddress {
  houseNo: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
}

export interface DeliveryApplicationVehicleInfo {
  vehicleType: DeliveryVehicleType;
  brand?: string;
  model?: string;
  registrationNumber?: string;
  drivingLicenseNumber?: string;
}

export interface DeliveryApplicationDocuments {
  profilePhoto: DocumentItem;
  idProof: {
    idType: "AADHAAR" | "PAN" | "VOTER_ID";
    document: DocumentItem;
  };
  drivingLicense?: DocumentItem | null;
  registrationCertificate?: DocumentItem | null;
  insurance?: DocumentItem | null;
}

export interface DeliveryApplication {
  _id: string;
  id?: string;
  applicationNumber: string;
  user?: string | User;
  personalInfo: DeliveryApplicationPersonalInfo;
  address: DeliveryApplicationAddress;
  vehicleInfo: DeliveryApplicationVehicleInfo;
  documents: DeliveryApplicationDocuments;
  status: DeliveryApplicationStatus;
  rejectionReason?: string | null;
  requestedCorrections?: string | null;
  reviewedBy?: string | User | null;
  reviewedAt?: string | null;
  termsAccepted: boolean;
  termsAcceptedAt?: string;
  history?: Array<{
    status: string;
    action: string;
    performedBy?: string | User | null;
    note?: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationStatusResponse {
  applicationNumber: string;
  status: DeliveryApplicationStatus;
  applicantName: string;
  maskedPhone: string;
  maskedEmail: string;
  vehicleType: DeliveryVehicleType;
  appliedAt: string;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  requestedCorrections?: string | null;
  userActive: boolean;
}

