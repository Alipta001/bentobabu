import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { BackendUser } from "./customerService";

export interface CreateStaffPayload {
  name: string;
  email: string;
  phone: string;
  password?: string;
  role: "KITCHEN" | "DELIVERY";
}

export const userService = {
  async getStaff(role?: string): Promise<BackendUser[]> {
    const params: Record<string, string | number> = { limit: 50 };
    if (role) {
      params.role = role.toUpperCase();
    }

    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        users: BackendUser[];
        pagination: { totalUsers: number };
      };
    }>(ADMIN_API_ENDPOINTS.USERS.LIST, { params });

    const all = res.data?.data?.users || [];
    if (!role) {
      return all.filter((u) => u.role !== "CUSTOMER");
    }
    return all;
  },

  async getDeliveryPartners(): Promise<BackendUser[]> {
    return this.getStaff("DELIVERY");
  },

  async createStaff(payload: CreateStaffPayload): Promise<BackendUser> {
    const res = await adminApiClient.post<{
      success: boolean;
      message: string;
      data: {
        user: BackendUser;
      };
    }>(ADMIN_API_ENDPOINTS.USERS.CREATE_STAFF, payload);

    return res.data?.data?.user;
  },

  async updateStatus(id: string, isActive: boolean): Promise<BackendUser> {
    const res = await adminApiClient.put<{
      success: boolean;
      data: {
        user: BackendUser;
      };
    }>(ADMIN_API_ENDPOINTS.USERS.UPDATE_STATUS(id), { isActive });

    return res.data?.data?.user;
  },

  async updateRole(id: string, role: string): Promise<BackendUser> {
    const res = await adminApiClient.put<{
      success: boolean;
      data: {
        user: BackendUser;
      };
    }>(ADMIN_API_ENDPOINTS.USERS.UPDATE_ROLE(id), { role });

    return res.data?.data?.user;
  },
};

