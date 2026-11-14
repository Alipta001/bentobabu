import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { Coupon } from "@/types";

export interface BackendCoupon {
  _id: string;
  id?: string;
  code: string;
  description?: string;
  discountType: "PERCENTAGE" | "FLAT";
  discountValue: number;
  minimumOrderAmount?: number;
  maximumDiscount?: number;
  usageLimit?: number;
  totalUses?: number;
  expiryDate: string;
  isActive: boolean;
  isDeleted?: boolean;
  createdAt?: string;
}

const mapCoupon = (c: BackendCoupon): Coupon => ({
  id: c._id || c.id || "",
  code: c.code,
  discountType: c.discountType?.toLowerCase() === "flat" ? "flat" : "percentage",
  discountValue: c.discountValue,
  minOrderValue: c.minimumOrderAmount || 0,
  maxDiscount: c.maximumDiscount,
  usageCount: c.totalUses || 0,
  usageLimit: c.usageLimit,
  isActive: c.isActive ?? true,
  description: c.description || "",
  expiresAt: c.expiryDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
});

export const couponService = {
  async getAll(): Promise<Coupon[]> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: BackendCoupon[];
    }>(ADMIN_API_ENDPOINTS.COUPONS.LIST, { params: { limit: 50 } });

    const list = Array.isArray(res.data?.data)
      ? res.data.data
      : Array.isArray(res.data)
      ? (res.data as unknown as BackendCoupon[])
      : [];

    return list.map(mapCoupon);
  },

  async create(data: {
    code: string;
    discountType: "percentage" | "flat";
    discountValue: number;
    minOrderValue?: number;
    maxDiscount?: number;
    usageLimit?: number;
    description?: string;
    expiresAt?: string;
    isActive?: boolean;
  }): Promise<Coupon> {
    const res = await adminApiClient.post<{
      success: boolean;
      data: BackendCoupon;
    }>(ADMIN_API_ENDPOINTS.COUPONS.CREATE, {
      code: data.code.toUpperCase().trim(),
      discountType: data.discountType === "flat" ? "FLAT" : "PERCENTAGE",
      discountValue: Number(data.discountValue),
      minimumOrderAmount: Number(data.minOrderValue || 0),
      maximumDiscount: data.maxDiscount ? Number(data.maxDiscount) : undefined,
      usageLimit: data.usageLimit ? Number(data.usageLimit) : undefined,
      description: data.description || "",
      expiryDate: data.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      isActive: data.isActive !== undefined ? data.isActive : true,
    });

    const c = res.data?.data || (res.data as unknown as BackendCoupon);
    return mapCoupon(c);
  },

  async update(id: string, data: Partial<Coupon>): Promise<Coupon> {
    const payload: Record<string, unknown> = {};
    if (data.code) payload.code = data.code.toUpperCase().trim();
    if (data.discountType) payload.discountType = data.discountType === "flat" ? "FLAT" : "PERCENTAGE";
    if (data.discountValue !== undefined) payload.discountValue = Number(data.discountValue);
    if (data.minOrderValue !== undefined) payload.minimumOrderAmount = Number(data.minOrderValue);
    if (data.maxDiscount !== undefined) payload.maximumDiscount = Number(data.maxDiscount);
    if (data.usageLimit !== undefined) payload.usageLimit = Number(data.usageLimit);
    if (data.description !== undefined) payload.description = data.description;
    if (data.expiresAt !== undefined) payload.expiryDate = data.expiresAt;
    if (data.isActive !== undefined) payload.isActive = data.isActive;

    const res = await adminApiClient.patch<{
      success: boolean;
      data: BackendCoupon;
    }>(ADMIN_API_ENDPOINTS.COUPONS.UPDATE(id), payload);

    const c = res.data?.data || (res.data as unknown as BackendCoupon);
    return mapCoupon(c);
  },

  async toggleActive(id: string, currentActive: boolean = true): Promise<Coupon> {
    const res = await adminApiClient.patch<{
      success: boolean;
      data: BackendCoupon;
    }>(ADMIN_API_ENDPOINTS.COUPONS.UPDATE_STATUS(id), {
      isActive: !currentActive,
    });

    const c = res.data?.data || (res.data as unknown as BackendCoupon);
    return mapCoupon(c);
  },

  async delete(id: string): Promise<void> {
    await adminApiClient.delete(ADMIN_API_ENDPOINTS.COUPONS.DELETE(id));
  },
};
