import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import {
  KPISummary,
  RevenueAnalytics,
  DashboardOverviewResponse,
  DashboardRevenueResponse,
  DashboardOrdersResponse,
  DashboardProductsResponse,
  DashboardCustomersResponse,
  DashboardLocationsResponse,
  DashboardPaymentsResponse,
  DashboardDeliveryResponse,
  DashboardPeakHoursResponse,
} from "@/types";

export interface AnalyticsFilterParams {
  period?: string;
  startDate?: string;
  endDate?: string;
}

export const analyticsService = {
  /**
   * Primary KPI overview cards with historical period comparisons
   */
  async getOverview(params?: AnalyticsFilterParams): Promise<DashboardOverviewResponse> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: DashboardOverviewResponse;
    }>(ADMIN_API_ENDPOINTS.DASHBOARD.OVERVIEW, { params });
    return res.data.data;
  },

  /**
   * Continuous revenue timeline and financial breakdown
   */
  async getRevenue(params?: AnalyticsFilterParams): Promise<DashboardRevenueResponse> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: DashboardRevenueResponse;
    }>(ADMIN_API_ENDPOINTS.DASHBOARD.REVENUE, { params });
    return res.data.data;
  },

  /**
   * Order status lifecycle breakdown, daily trends, and cancellation reasons
   */
  async getOrders(params?: AnalyticsFilterParams): Promise<DashboardOrdersResponse> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: DashboardOrdersResponse;
    }>(ADMIN_API_ENDPOINTS.DASHBOARD.ORDERS, { params });
    return res.data.data;
  },

  /**
   * Product performance: top-selling, least-selling, and category revenue
   */
  async getProducts(params?: AnalyticsFilterParams): Promise<DashboardProductsResponse> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: DashboardProductsResponse;
    }>(ADMIN_API_ENDPOINTS.DASHBOARD.PRODUCTS, { params });
    return res.data.data;
  },

  /**
   * Customer insights: segmentation, top spenders, repeat purchase metrics
   */
  async getCustomers(params?: AnalyticsFilterParams): Promise<DashboardCustomersResponse> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: DashboardCustomersResponse;
    }>(ADMIN_API_ENDPOINTS.DASHBOARD.CUSTOMERS, { params });
    return res.data.data;
  },

  /**
   * Geographic demand: serviceable revenue by PIN and unserved expansion requests
   */
  async getLocations(params?: AnalyticsFilterParams): Promise<DashboardLocationsResponse> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: DashboardLocationsResponse;
    }>(ADMIN_API_ENDPOINTS.DASHBOARD.LOCATIONS, { params });
    return res.data.data;
  },

  /**
   * Payment analytics: status breakdown, methods, and refunds
   */
  async getPayments(params?: AnalyticsFilterParams): Promise<DashboardPaymentsResponse> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: DashboardPaymentsResponse;
    }>(ADMIN_API_ENDPOINTS.DASHBOARD.PAYMENTS, { params });
    return res.data.data;
  },

  /**
   * Delivery performance: fleet readiness, assignment queues, average delivery time
   */
  async getDelivery(params?: AnalyticsFilterParams): Promise<DashboardDeliveryResponse> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: DashboardDeliveryResponse;
    }>(ADMIN_API_ENDPOINTS.DASHBOARD.DELIVERY, { params });
    return res.data.data;
  },

  /**
   * Peak ordering velocities: hourly velocity and day of week distribution
   */
  async getPeakHours(params?: AnalyticsFilterParams): Promise<DashboardPeakHoursResponse> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: DashboardPeakHoursResponse;
    }>(ADMIN_API_ENDPOINTS.DASHBOARD.PEAK_HOURS, { params });
    return res.data.data;
  },

  // -------------------------------------------------------------
  // Legacy backward-compatibility helpers for other admin views
  // -------------------------------------------------------------
  async getKPISummary(): Promise<KPISummary> {
    const data = await this.getOverview({ period: "today" });
    return {
      totalRevenue: data.kpis.totalRevenue.value,
      todayRevenue: data.kpis.totalRevenue.value,
      totalOrders: data.kpis.totalOrders.value,
      todayOrders: data.kpis.totalOrders.value,
      pendingOrders: data.operations.pendingOrders + data.operations.confirmedOrders + data.operations.preparingOrders,
      completedOrders: data.kpis.completedOrders.value,
      cancelledOrders: Math.round(data.kpis.totalOrders.value * (data.kpis.cancellationRate.value / 100)),
      totalCustomers: data.kpis.totalCustomers.value,
      totalProducts: data.operations.activeProductsCount,
      lowStockCount: data.operations.lowStockCount,
    };
  },

  async getRevenueAnalytics(period: string = "30d"): Promise<RevenueAnalytics> {
    const [revData, prodData] = await Promise.all([
      this.getRevenue({ period }),
      this.getProducts({ period }),
    ]);

    return {
      dailyRevenue: revData.timeline.map((t) => ({
        date: t.date,
        revenue: t.revenue,
        orders: t.paidOrdersCount,
      })),
      categoryRevenue: prodData.categoryPerformance.map((c) => ({
        category: c.name,
        revenue: c.revenue,
      })),
      bestsellers: prodData.topSellingProducts.map((b) => ({
        name: b.name,
        quantity: b.unitsSold,
        revenue: b.grossSales,
      })),
    };
  },
};
