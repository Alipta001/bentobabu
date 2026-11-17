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
import { mediaService, VideoUploadProgressCallback } from "@/services/mediaService";
import { videoService, CreateVideoPayload } from "@/services/videoService";
import {
  deliveryOperationsService,
  GetPartnersParams,
  AccountStatus,
} from "@/services/deliveryOperationsService";
import { OrderStatus, Product, Category, Coupon, BusinessSettings, ProductVideo, VideoContent } from "@/types";

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
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) => {
      return productService.toggleAvailability(id, isAvailable);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "menu"] });
    },
  });
}

export function useToggleProductStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => {
      return productService.toggleStatus(id, isActive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "menu"] });
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
// ==========================================
// DAILY & WEEKLY MENU SCHEDULING
// ==========================================

export function useDailyMenu(date?: string) {
  return useQuery({
    queryKey: ["admin", "dailyMenu", date],
    queryFn: () => menuService.getDailyMenu(date),
  });
}

export function useSaveDailyMenu() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      date: string;
      items: Array<{ product: string; isAvailable: boolean }>;
      isPublished?: boolean;
      notes?: string;
    }) => menuService.saveDailyMenu(payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "dailyMenu"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dailyMenu", variables.date] });
      queryClient.invalidateQueries({ queryKey: ["admin", "weeklyMenu"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });
}

export function useContinueYesterday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetDate: string) => menuService.continueYesterday(targetDate),
    onSuccess: (_, targetDate) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "dailyMenu"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dailyMenu", targetDate] });
      queryClient.invalidateQueries({ queryKey: ["admin", "weeklyMenu"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });
}

export function useWeeklyMenu(startDate?: string) {
  return useQuery({
    queryKey: ["admin", "weeklyMenu", startDate],
    queryFn: () => menuService.getWeeklyMenu(startDate),
  });
}

export function useSaveWeeklyMenu() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      days: Array<{
        date: string;
        items: Array<{ product: string; isAvailable: boolean }>;
        isPublished?: boolean;
      }>;
    }) => menuService.saveWeeklyMenu(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "dailyMenu"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "weeklyMenu"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });
}

export function useApplyWeekAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { sourceDate: string; targetDates: string[] }) =>
      menuService.applyWeekAll(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "dailyMenu"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "weeklyMenu"] });
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

export function useUpdateDeliveryZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        pincodes?: string[];
        deliveryCharge?: number;
        minimumOrderAmount?: number;
        estimatedDeliveryMinutes?: number;
        isActive?: boolean;
      };
    }) => deliveryService.updateZone(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "deliveryZones"] });
    },
  });
}

export function useDeleteDeliveryZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deliveryService.deleteZone(id),
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

// ==========================================
// MEDIA STORAGE & MANAGEMENT
// ==========================================

export function useMediaUsage() {
  return useQuery({
    queryKey: ["admin", "mediaUsage"],
    queryFn: () => mediaService.getUsage(),
    refetchInterval: 30000,
  });
}

export function useMediaList(params?: {
  provider?: string;
  mediaType?: string;
  productId?: string;
  categoryId?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["admin", "mediaList", params],
    queryFn: () => mediaService.listMedia(params),
  });
}

export function useUploadImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      folder,
      productId,
      categoryId,
    }: {
      file: File;
      folder?: string;
      productId?: string;
      categoryId?: string;
    }) => mediaService.uploadImage(file, folder, productId, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "mediaList"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "mediaUsage"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });
}

export function useDeleteImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mediaService.deleteImage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "mediaList"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "mediaUsage"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });
}

export function useUploadVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      file: File;
      productId?: string;
      posterUrl?: string;
      durationSeconds?: number;
      onProgress?: VideoUploadProgressCallback;
    }) => mediaService.uploadVideoWithProgress(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "mediaList"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "mediaUsage"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });
}

export function useDeleteVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mediaService.deleteVideo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "mediaList"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "mediaUsage"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });
}

// ==========================================
// VIDEO CONTENT MANAGEMENT
// ==========================================

export function useAdminVideos(params?: {
  status?: string;
  category?: string;
  contentType?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["admin", "videos", params],
    queryFn: () => videoService.getAll(params),
  });
}

export function useAdminVideo(id: string) {
  return useQuery({
    queryKey: ["admin", "videos", id],
    queryFn: () => videoService.getById(id),
    enabled: !!id,
  });
}

export function useCreateVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateVideoPayload) => videoService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "videos"] });
    },
  });
}

export function useUpdateVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateVideoPayload> }) =>
      videoService.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "videos"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "videos", variables.id] });
    },
  });
}

export function useDeleteVideoContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => videoService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "videos"] });
    },
  });
}

export function useUpdateVideoStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED" }) =>
      videoService.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "videos"] });
    },
  });
}

// ==========================================
// DELIVERY OPERATIONS & LIVE LOCATION MONITORING
// ==========================================

export function useDeliveryOperationsOverview() {
  return useQuery({
    queryKey: ["admin", "deliveryOperations", "overview"],
    queryFn: () => deliveryOperationsService.getOverview(),
    refetchInterval: 8000,
  });
}

export function useMonitoredPartners(params?: GetPartnersParams) {
  return useQuery({
    queryKey: ["admin", "deliveryOperations", "partners", params],
    queryFn: () => deliveryOperationsService.getPartners(params),
    refetchInterval: 8000,
  });
}

export function useMonitoredPartnerDetail(id: string | null) {
  return useQuery({
    queryKey: ["admin", "deliveryOperations", "partnerDetail", id],
    queryFn: () => (id ? deliveryOperationsService.getPartnerDetail(id) : null),
    enabled: !!id,
    refetchInterval: 10000,
  });
}

export function useUpdatePartnerStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      accountStatus,
      reason,
    }: {
      id: string;
      accountStatus: "ACTIVE" | "SUSPENDED";
      reason?: string;
    }) => deliveryOperationsService.updatePartnerStatus(id, accountStatus, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "deliveryOperations"] });
      queryClient.invalidateQueries({
        queryKey: ["admin", "deliveryOperations", "partnerDetail", variables.id],
      });
    },
  });
}
