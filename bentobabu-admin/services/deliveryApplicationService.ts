import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";

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

export interface DeliveryApplication {
  _id: string;
  id?: string;
  applicationNumber: string;
  user: {
    _id: string;
    id?: string;
    name: string;
    email: string;
    phone: string;
    isActive: boolean;
    isPhoneVerified?: boolean;
    profileImage?: string;
    createdAt?: string;
  };
  personalInfo: {
    fullName: string;
    phone: string;
    email: string;
    dateOfBirth: string;
    gender: "MALE" | "FEMALE" | "OTHER";
  };
  address: {
    houseNo: string;
    street: string;
    city: string;
    state: string;
    pincode: string;
    landmark?: string;
  };
  vehicleInfo: {
    vehicleType: DeliveryVehicleType;
    brand?: string;
    model?: string;
    registrationNumber?: string;
    drivingLicenseNumber?: string;
  };
  documents: {
    profilePhoto: DocumentItem;
    idProof: {
      idType: "AADHAAR" | "PAN" | "VOTER_ID";
      document: DocumentItem;
    };
    drivingLicense?: DocumentItem | null;
    registrationCertificate?: DocumentItem | null;
    insurance?: DocumentItem | null;
  };
  status: DeliveryApplicationStatus;
  rejectionReason?: string | null;
  requestedCorrections?: string | null;
  reviewedBy?: {
    _id: string;
    name: string;
    email: string;
  } | null;
  reviewedAt?: string | null;
  termsAccepted: boolean;
  termsAcceptedAt?: string;
  history?: Array<{
    status: string;
    action: string;
    performedBy?: {
      _id: string;
      name: string;
      email: string;
    } | null;
    note?: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryApplicationStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  correctionsRequested: number;
  suspended: number;
}

export interface GetApplicationsResponse {
  items: DeliveryApplication[];
  total: number;
  totalPages: number;
  stats: DeliveryApplicationStats;
}

export const deliveryApplicationService = {
  async getAll(params?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    order?: "asc" | "desc";
  }): Promise<GetApplicationsResponse> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: DeliveryApplication[];
      pagination: { total: number; page: number; limit: number; totalPages: number };
      stats: DeliveryApplicationStats;
    }>(ADMIN_API_ENDPOINTS.DELIVERY_APPLICATIONS.LIST, { params });

    return {
      items: res.data.data,
      total: res.data.pagination?.total || res.data.data.length,
      totalPages: res.data.pagination?.totalPages || 1,
      stats: res.data.stats || {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        correctionsRequested: 0,
        suspended: 0,
      },
    };
  },

  async getById(id: string): Promise<DeliveryApplication> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: DeliveryApplication;
    }>(ADMIN_API_ENDPOINTS.DELIVERY_APPLICATIONS.DETAIL(id));

    return res.data.data;
  },

  async approve(id: string, note?: string): Promise<DeliveryApplication> {
    const res = await adminApiClient.post<{
      success: boolean;
      data: DeliveryApplication;
    }>(ADMIN_API_ENDPOINTS.DELIVERY_APPLICATIONS.APPROVE(id), { note });

    return res.data.data;
  },

  async reject(id: string, reason: string): Promise<DeliveryApplication> {
    const res = await adminApiClient.post<{
      success: boolean;
      data: DeliveryApplication;
    }>(ADMIN_API_ENDPOINTS.DELIVERY_APPLICATIONS.REJECT(id), { reason });

    return res.data.data;
  },

  async requestCorrections(id: string, corrections: string): Promise<DeliveryApplication> {
    const res = await adminApiClient.post<{
      success: boolean;
      data: DeliveryApplication;
    }>(ADMIN_API_ENDPOINTS.DELIVERY_APPLICATIONS.REQUEST_CORRECTIONS(id), { corrections });

    return res.data.data;
  },

  async suspend(id: string, reason?: string): Promise<DeliveryApplication> {
    const res = await adminApiClient.post<{
      success: boolean;
      data: DeliveryApplication;
    }>(ADMIN_API_ENDPOINTS.DELIVERY_APPLICATIONS.SUSPEND(id), { reason });

    return res.data.data;
  },
};
