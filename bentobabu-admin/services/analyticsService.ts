import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { KPISummary, RevenueAnalytics } from "@/types";

export const analyticsService = {
  async getKPISummary(): Promise<KPISummary> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        totalCustomers: number;
        totalActiveProducts: number;
        lowStockProductCount: number;
        totalOrders: number;
        todayOrders: number;
        totalRevenue: number;
        todayRevenue: number;
        pendingOrders: number;
        confirmedOrders: number;
        preparingOrders: number;
        readyForPickupOrders: number;
        outForDeliveryOrders: number;
        deliveredOrders: number;
        cancelledOrders: number;
      };
    }>(ADMIN_API_ENDPOINTS.DASHBOARD.OVERVIEW);

    const d = res.data?.data || (res.data as unknown as Record<string, number>);

    return {
      totalRevenue: d.totalRevenue ?? 0,
      todayRevenue: d.todayRevenue ?? 0,
      totalOrders: d.totalOrders ?? 0,
      todayOrders: d.todayOrders ?? 0,
      pendingOrders: (d.pendingOrders ?? 0) + (d.confirmedOrders ?? 0) + (d.preparingOrders ?? 0) + (d.readyForPickupOrders ?? 0) + (d.outForDeliveryOrders ?? 0),
      completedOrders: d.deliveredOrders ?? 0,
      cancelledOrders: d.cancelledOrders ?? 0,
      totalCustomers: d.totalCustomers ?? 0,
      totalProducts: d.totalActiveProducts ?? 0,
      lowStockCount: d.lowStockProductCount ?? 0,
    };
  },

  async getRevenueAnalytics(period: string = "30d"): Promise<RevenueAnalytics> {
    const [revRes, prodRes] = await Promise.all([
      adminApiClient.get<{
        success: boolean;
        data: {
          timeline: Array<{
            date: string;
            revenue: number;
            paidOrdersCount: number;
            discounts: number;
            deliveryFees: number;
          }>;
          summary: {
            totalRevenue: number;
            totalPaidOrders: number;
            averageOrderValue: number;
          };
        };
      }>(ADMIN_API_ENDPOINTS.DASHBOARD.REVENUE, {
        params: { period },
      }),
      adminApiClient.get<{
        success: boolean;
        data: {
          bestSellingProducts: Array<{
            productId: string;
            name: string;
            totalQuantitySold: number;
            totalRevenue: number;
          }>;
          topCategories: Array<{
            categoryId: string;
            name: string;
            totalItemsSold: number;
          }>;
        };
      }>(ADMIN_API_ENDPOINTS.DASHBOARD.PRODUCTS),
    ]);

    const timeline = revRes.data?.data?.timeline || [];
    const bestSelling = prodRes.data?.data?.bestSellingProducts || [];
    const topCategories = prodRes.data?.data?.topCategories || [];

    return {
      dailyRevenue: timeline.map((t) => ({
        date: t.date,
        revenue: t.revenue,
        orders: t.paidOrdersCount,
      })),
      categoryRevenue: topCategories.map((c) => ({
        category: c.name,
        revenue: c.totalItemsSold,
      })),
      bestsellers: bestSelling.map((b) => ({
        name: b.name,
        quantity: b.totalQuantitySold,
        revenue: b.totalRevenue,
      })),
    };
  },

  async getOrderDashboardStats(params?: { startDate?: string; endDate?: string }) {
    const res = await adminApiClient.get(ADMIN_API_ENDPOINTS.DASHBOARD.ORDERS, { params });
    return res.data?.data || res.data;
  },

  async getCustomerDashboardStats(params?: { startDate?: string; endDate?: string }) {
    const res = await adminApiClient.get(ADMIN_API_ENDPOINTS.DASHBOARD.CUSTOMERS, { params });
    return res.data?.data || res.data;
  },
};
