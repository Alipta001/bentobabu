import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { Customer } from "@/types";

export interface BackendUser {
  _id: string;
  id?: string;
  name: string;
  email: string;
  phone: string;
  role: "CUSTOMER" | "ADMIN" | "KITCHEN" | "DELIVERY";
  isActive: boolean;
  createdAt: string;
  orderCount?: number;
  totalSpent?: number;
}

const mapUserToCustomer = (u: BackendUser): Customer => ({
  id: u._id || u.id || "",
  name: u.name,
  email: u.email,
  phone: u.phone,
  totalOrders: u.orderCount || 0,
  totalSpent: u.totalSpent || 0,
  createdAt: u.createdAt || new Date().toISOString(),
  isBlocked: !u.isActive,
});

export const customerService = {
  async getAll(search?: string): Promise<Customer[]> {
    const params: Record<string, string | number> = {
      role: "CUSTOMER",
      limit: 50,
    };
    if (search && search.trim()) {
      params.search = search.trim();
    }

    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        users: BackendUser[];
        pagination: { totalUsers: number };
      };
    }>(ADMIN_API_ENDPOINTS.USERS.LIST, { params });

    const users = res.data?.data?.users || [];
    return users.map(mapUserToCustomer);
  },

  async toggleBlock(id: string, currentlyBlocked: boolean = false): Promise<Customer> {
    const newIsActive = currentlyBlocked; // If currently blocked, we want to activate (true)
    const res = await adminApiClient.put<{
      success: boolean;
      data: {
        user: BackendUser;
      };
    }>(ADMIN_API_ENDPOINTS.USERS.UPDATE_STATUS(id), {
      isActive: newIsActive,
    });

    const user = res.data?.data?.user || (res.data as unknown as BackendUser);
    return mapUserToCustomer(user);
  },
};
