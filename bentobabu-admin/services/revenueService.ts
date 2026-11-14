import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";

export interface RevenueSummary {
  grossSales: number;
  netSales: number;
  totalDiscounts: number;
  deliveryCharges: number;
  taxCollected: number;
  successfulCount: number;
  pendingCount: number;
  failedCount: number;
  refundedCount: number;
  avgOrderValue: number;
}

export const revenueService = {
  async getSummary(period: string = "30d"): Promise<RevenueSummary> {
    const [revRes, orderRes] = await Promise.all([
      adminApiClient.get<{
        success: boolean;
        data: {
          summary: {
            totalRevenue: number;
            totalPaidOrders: number;
            averageOrderValue: number;
            totalDiscounts: number;
            totalDeliveryFees: number;
          };
        };
      }>(ADMIN_API_ENDPOINTS.DASHBOARD.REVENUE, { params: { period } }),
      adminApiClient.get<{
        success: boolean;
        data: {
          paymentStatusBreakdown?: Array<{ status: string; count: number }>;
        };
      }>(ADMIN_API_ENDPOINTS.DASHBOARD.ORDERS, { params: { period } }),
    ]);

    const s = revRes.data?.data?.summary || {
      totalRevenue: 0,
      totalPaidOrders: 0,
      averageOrderValue: 0,
      totalDiscounts: 0,
      totalDeliveryFees: 0,
    };

    const pBreakdown = orderRes.data?.data?.paymentStatusBreakdown || [];
    const getCount = (st: string) => pBreakdown.find((x) => x.status === st)?.count || 0;

    const grossSales = s.totalRevenue || 0;
    const deliveryCharges = s.totalDeliveryFees || 0;
    const totalDiscounts = s.totalDiscounts || 0;
    const taxCollected = Math.round(grossSales * 0.05); // 5% GST on food
    const netSales = Math.max(0, grossSales - deliveryCharges - taxCollected);

    return {
      grossSales,
      netSales,
      totalDiscounts,
      deliveryCharges,
      taxCollected,
      successfulCount: s.totalPaidOrders || getCount("PAID"),
      pendingCount: getCount("PENDING"),
      failedCount: getCount("FAILED"),
      refundedCount: getCount("REFUNDED"),
      avgOrderValue: s.averageOrderValue || 0,
    };
  },
};
