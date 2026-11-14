import apiClient from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { Address } from "@/types";

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export const normalizeAddress = (addr: any): Address => {
  const addressLine = addr.addressLine || [addr.houseNo, addr.street].filter(Boolean).join(", ") || "";
  return {
    id: addr.id || addr._id || "",
    _id: addr._id || addr.id || "",
    fullName: addr.fullName || addr.name || "Customer",
    name: addr.fullName || addr.name || "Customer",
    phone: addr.phone || "",
    addressLine,
    houseNo: addr.houseNo || addressLine.split(",")[0] || "",
    street: addr.street || addressLine.split(",").slice(1).join(",").trim() || addressLine,
    landmark: addr.landmark || "",
    city: addr.city || "Barrackpore",
    state: addr.state || "West Bengal",
    pincode: addr.pincode || "700120",
    addressType: (addr.addressType || addr.type || "HOME").toUpperCase() as Address["addressType"],
    type: (addr.addressType || addr.type || "home").toLowerCase() as Address["type"],
    isDefault: addr.isDefault ?? false,
  };
};

export const addressService = {
  async getAll(): Promise<Address[]> {
    try {
      const response = await apiClient.get<
        ApiResponse<any> | any
      >(API_ENDPOINTS.ADDRESSES.LIST);

      const raw = response.data;
      let list: any[] = [];

      if (raw && "data" in raw && Array.isArray(raw.data)) {
        list = raw.data;
      } else if (raw && "data" in raw && Array.isArray(raw.data?.addresses)) {
        list = raw.data.addresses;
      } else if (raw && "addresses" in raw && Array.isArray(raw.addresses)) {
        list = raw.addresses;
      } else if (Array.isArray(raw)) {
        list = raw;
      }

      return list.map(normalizeAddress);
    } catch (err) {
      console.error("[addressService] Error fetching addresses:", err);
      return [];
    }
  },

  async create(data: Partial<Address>): Promise<Address> {
    const payload = {
      fullName: data.fullName || data.name || "Customer",
      phone: (data.phone || "").replace(/[\s\-+]/g, "").slice(-10),
      addressLine: data.addressLine || [data.houseNo, data.street].filter(Boolean).join(", "),
      landmark: data.landmark || "",
      city: data.city || "Barrackpore",
      state: data.state || "West Bengal",
      pincode: data.pincode || "700120",
      addressType: (data.addressType || data.type || "HOME").toUpperCase(),
      isDefault: data.isDefault ?? false,
    };

    const response = await apiClient.post<
      ApiResponse<any> | any
    >(API_ENDPOINTS.ADDRESSES.CREATE, payload);

    const raw = response.data;
    const addr =
      raw && "data" in raw
        ? raw.data?.address || raw.data
        : (raw as any)?.address || raw;
    return normalizeAddress(addr);
  },

  async update(id: string, data: Partial<Address>): Promise<Address> {
    const payload: Record<string, unknown> = {};
    if (data.fullName || data.name) payload.fullName = data.fullName || data.name;
    if (data.phone) payload.phone = data.phone.replace(/[\s\-+]/g, "").slice(-10);
    if (data.addressLine || data.houseNo || data.street) {
      payload.addressLine = data.addressLine || [data.houseNo, data.street].filter(Boolean).join(", ");
    }
    if (data.landmark !== undefined) payload.landmark = data.landmark;
    if (data.city) payload.city = data.city;
    if (data.state) payload.state = data.state;
    if (data.pincode) payload.pincode = data.pincode;
    if (data.addressType || data.type) {
      payload.addressType = (data.addressType || data.type || "HOME").toUpperCase();
    }
    if (data.isDefault !== undefined) payload.isDefault = data.isDefault;

    const response = await apiClient.patch<
      ApiResponse<{ address: any }> | { address: any }
    >(API_ENDPOINTS.ADDRESSES.UPDATE(id), payload);

    const raw = response.data;
    const addr = (raw && "data" in raw && raw.data?.address) ? raw.data.address : (raw as any)?.address || raw;
    return normalizeAddress(addr);
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(API_ENDPOINTS.ADDRESSES.DELETE(id));
  },
};
