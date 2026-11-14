import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { analyticsService } from "@/services/analyticsService";
import { orderService } from "@/services/orderService";
import { productService } from "@/services/productService";
import { categoryService } from "@/services/categoryService";
import { inventoryService, StockAdjustmentPayload } from "@/services/inventoryService";
import { menuService } from "@/services/menuService";
import { customerService } from "@/services/customerService";
import { userService, CreateStaffPayload } from "@/services/userService";
import { revenueService } from "@/services/revenueService";
import { paymentService } from "@/services/paymentService";
import { couponService } from "@/services/couponService";
import { deliveryService } from "@/services/deliveryService";
import { reviewService } from "@/services/reviewService";
import { settingsService } from "@/services/settingsService";
import { notificationService } from "@/services/notificationService";
import { OrderStatus, Product, Category, Coupon, BusinessSettings } from "@/types";

// ==========================================
// DASHBOARD & ANALYTICS
// ==========================================

export function useKPISummary() {
  return useQuery({
    queryKey: ["admin", "kpis"],
    queryFn: () => analyticsService.getKPISummary(),
    refetchInterval: 15000,
  });
}

export function useRevenueAnalytics(period: string = "30d") {
  return useQuery({
    queryKey: ["admin", "revenueAnalytics", period],
    queryFn: () => analyticsService.getRevenueAnalytics(period),
    staleTime: 60 * 1000,
  });
}

// ==========================================
// ORDERS & OPERATIONS
// ==========================================

export function useAdminOrders(params?: { status?: string; search?: string }) {
  return useQuery({
    queryKey: ["admin", "orders", params],
    queryFn: () => orderService.getAll(params),
    refetchInterval: 12000,
  });
}

export function useAdminOrder(id: string) {
  return useQuery({
    queryKey: ["admin", "orders", id],
    queryFn: () => orderService.getById(id),
    enabled: !!id,
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: OrderStatus | string; note?: string }) =>
      orderService.updateStatus(id, status, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "kpis"] });
    },
  });
}

export function useAssignDeliveryPartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, deliveryPartnerId }: { orderId: string; deliveryPartnerId: string }) =>
      orderService.assignDeliveryPartner(orderId, deliveryPartnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
  });
}

export function useOrderHistory(orderId: string) {
  return useQuery({
    queryKey: ["admin", "orderHistory", orderId],
    queryFn: () => orderService.getOrderHistory(orderId),
    enabled: !!orderId,
  });
}

// ==========================================
// PRODUCTS
// ==========================================

export function useAdminProducts(params?: { categoryId?: string; search?: string }) {
  return useQuery({
    queryKey: ["admin", "products", params],
    queryFn: () => productService.getAll(params),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Product, "id" | "createdAt">) => productService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "kpis"] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Product> }) =>
      productService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "kpis"] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => productService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "kpis"] });
    },
  });
}

export function useToggleProductAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (param: string | { id: string; isAvailable?: boolean }) => {
      const id = typeof param === "string" ? param : param.id;
      const isAvailable = typeof param === "string" ? undefined : param.isAvailable;
      return productService.toggleAvailability(id, isAvailable);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });
}

// ==========================================
// CATEGORIES
// ==========================================

export function useAdminCategories() {
  return useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () => categoryService.getAll(),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Category, "id">) => categoryService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });
}

export function useToggleCategoryStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      categoryService.toggleStatus(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });
}

// ==========================================
// INVENTORY
// ==========================================

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: StockAdjustmentPayload) => inventoryService.adjustStock(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "kpis"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "inventory"] });
    },
  });
}

export function useInventoryHistory(productId: string) {
  return useQuery({
    queryKey: ["admin", "inventoryHistory", productId],
    queryFn: () => inventoryService.getHistory(productId),
    enabled: !!productId,
  });
}

// ==========================================
// DAILY MENU
// ==========================================

export function useDailyMenu() {
  return useQuery({
    queryKey: ["admin", "dailyMenu"],
    queryFn: () => menuService.getDailyMenu(),
  });
}

export function useToggleDailyMenu() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => menuService.toggleItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "dailyMenu"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });
}

// ==========================================
// CUSTOMERS & STAFF
// ==========================================

export function useAdminCustomers(search?: string) {
  return useQuery({
    queryKey: ["admin", "customers", search],
    queryFn: () => customerService.getAll(search),
  });
}

export function useToggleBlockCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isBlocked }: { id: string; isBlocked?: boolean }) =>
      customerService.toggleBlock(id, isBlocked),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
  });
}

export function useAdminStaff(role?: string) {
  return useQuery({
    queryKey: ["admin", "staff", role],
    queryFn: () => userService.getStaff(role),
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateStaffPayload) => userService.createStaff(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "deliveryPartners"] });
    },
  });
}

export function useDeliveryPartners() {
  return useQuery({
    queryKey: ["admin", "deliveryPartners"],
    queryFn: () => userService.getDeliveryPartners(),
  });
}

// ==========================================
// REVENUE & PAYMENTS
// ==========================================

export function useRevenueSummary(period: string = "30d") {
  return useQuery({
    queryKey: ["admin", "revenueSummary", period],
    queryFn: () => revenueService.getSummary(period),
  });
}

export function useAdminPayments() {
  return useQuery({
    queryKey: ["admin", "payments"],
    queryFn: () => paymentService.getAll(),
  });
}

// ==========================================
// COUPONS
// ==========================================

export function useAdminCoupons() {
  return useQuery({
    queryKey: ["admin", "coupons"],
    queryFn: () => couponService.getAll(),
  });
}

export function useCreateCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Coupon, "id" | "usageCount">) => couponService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] });
    },
  });
}

export function useToggleCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (param: string | { id: string; isActive?: boolean }) => {
      const id = typeof param === "string" ? param : param.id;
      const isActive = typeof param === "string" ? undefined : param.isActive;
      return couponService.toggleActive(id, isActive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] });
    },
  });
}

export function useDeleteCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => couponService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] });
    },
  });
}

// ==========================================
// DELIVERY ZONES & SLOTS
// ==========================================

export function useAdminDeliveryZones() {
  return useQuery({
    queryKey: ["admin", "deliveryZones"],
    queryFn: () => deliveryService.getZones(),
  });
}

export function useCreateDeliveryZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      pincodes: string[];
      deliveryCharge?: number;
      minimumOrderAmount?: number;
      estimatedDeliveryMinutes?: number;
    }) => deliveryService.createZone(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "deliveryZones"] });
    },
  });
}

export function useToggleDeliveryZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isServiceable }: { id: string; isServiceable?: boolean }) =>
      deliveryService.toggleZone(id, isServiceable),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "deliveryZones"] });
    },
  });
}

export function useAdminDeliverySlots(params?: { date?: string; isActive?: boolean }) {
  return useQuery({
    queryKey: ["admin", "deliverySlots", params],
    queryFn: () => deliveryService.getSlots(params),
  });
}

export function useCreateDeliverySlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      date: string;
      label: string;
      startTime: string;
      endTime: string;
      capacity?: number;
    }) => deliveryService.createSlot(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "deliverySlots"] });
    },
  });
}

export function useToggleDeliverySlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive?: boolean }) =>
      deliveryService.toggleSlot(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "deliverySlots"] });
    },
  });
}

// ==========================================
// REVIEWS
// ==========================================

export function useAdminReviews() {
  return useQuery({
    queryKey: ["admin", "reviews"],
    queryFn: () => reviewService.getAll(),
  });
}

export function useToggleReviewApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reviewService.toggleApproval(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
    },
  });
}

// ==========================================
// SETTINGS
// ==========================================

export function useAdminSettings() {
  return useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => settingsService.getSettings(),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<BusinessSettings>) => settingsService.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
  });
}

// ==========================================
// NOTIFICATIONS MONITORING
// ==========================================

export function useAdminNotifications(params?: {
  channel?: string;
  status?: string;
  eventType?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["admin", "notifications", params],
    queryFn: () => notificationService.getNotifications(params),
    refetchInterval: 15000,
  });
}

export function useNotificationStats() {
  return useQuery({
    queryKey: ["admin", "notificationStats"],
    queryFn: () => notificationService.getStats(),
    refetchInterval: 20000,
  });
}

export function useRetryNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationService.retry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "notifications"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "notificationStats"] });
    },
  });
}
