import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { categoryService } from "@/services/categoryService";
import { productService } from "@/services/productService";
import { cartService } from "@/services/cartService";
import { orderService } from "@/services/orderService";
import { addressService } from "@/services/addressService";
import { authService } from "@/services/authService";
import { deliveryService } from "@/services/deliveryService";
import { notificationService } from "@/services/notificationService";
import { videoService } from "@/services/videoService";
import { CartItem, ProductFilterOptions, Address, VideoFilterOptions } from "@/types";
import { INITIAL_PRODUCTS } from "@/lib/data/products";

export const QUERY_KEYS = {
  CATEGORIES: ["categories"],
  CATEGORY: (slug: string) => ["categories", slug],
  PRODUCTS: (filters?: ProductFilterOptions) => ["products", filters],
  PRODUCT: (slug: string) => ["product", slug],
  BESTSELLERS: ["products", "bestsellers"],
  RELATED_PRODUCTS: (id: string) => ["products", id, "related"],
  CART: ["cart"],
  ORDERS: ["orders"],
  ORDER: (id: string) => ["orders", id],
  ADDRESSES: ["addresses"],
  USER_PROFILE: ["user", "profile"],
  SERVICEABILITY: (pincode: string) => ["delivery", "serviceability", pincode],
  DELIVERY_SLOTS: (pincode: string, date: string) => ["delivery", "slots", pincode, date],
  NOTIFICATIONS: (isRead?: boolean) => ["notifications", isRead],
  UNREAD_NOTIFICATIONS_COUNT: ["notifications", "unread-count"],
  NOTIFICATION_PREFERENCES: ["notifications", "preferences"],
  VIDEOS: (filters?: VideoFilterOptions) => ["videos", filters],
  FEATURED_VIDEOS: (limit?: number) => ["videos", "featured", limit],
  VIDEO: (slug: string) => ["video", slug],
};

export function useCategories() {
  return useQuery({
    queryKey: QUERY_KEYS.CATEGORIES,
    queryFn: () => categoryService.getAll(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCategory(slug: string) {
  return useQuery({
    queryKey: QUERY_KEYS.CATEGORY(slug),
    queryFn: () => categoryService.getBySlug(slug),
    enabled: !!slug,
  });
}

export function useProducts(filters?: ProductFilterOptions) {
  return useQuery({
    queryKey: QUERY_KEYS.PRODUCTS(filters),
    queryFn: ({ signal }) => productService.getAll(filters, signal),
    staleTime: 5 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PRODUCT(slug),
    queryFn: () => productService.getBySlug(slug),
    enabled: !!slug,
    staleTime: 5 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useBestsellers() {
  return useQuery({
    queryKey: QUERY_KEYS.BESTSELLERS,
    queryFn: () => productService.getBestsellers(),
    initialData: () => INITIAL_PRODUCTS.slice(0, 4),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRelatedProducts(productId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.RELATED_PRODUCTS(productId),
    queryFn: () => productService.getRelated(productId),
    enabled: !!productId,
  });
}

export function useBackendCart() {
  return useQuery({
    queryKey: QUERY_KEYS.CART,
    queryFn: () => cartService.getCart(),
    staleTime: 10 * 1000,
  });
}

export function useOrders(enabled: boolean = true) {
  return useQuery({
    queryKey: QUERY_KEYS.ORDERS,
    queryFn: () => orderService.getAll(),
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.ORDER(id),
    queryFn: () => orderService.getById(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const order = query.state.data;
      if (
        order &&
        [
          "pending",
          "confirmed",
          "preparing",
          "ready_for_pickup",
          "rider_accepted",
          "picked_up",
          "out_for_delivery",
          "PENDING",
          "CONFIRMED",
          "PREPARING",
          "READY_FOR_PICKUP",
          "RIDER_ACCEPTED",
          "PICKED_UP",
          "OUT_FOR_DELIVERY",
        ].includes(order.status)
      ) {
        return 3000;
      }
      return false;
    },
  });
}

export function useAddresses(enabled: boolean = true) {
  return useQuery({
    queryKey: QUERY_KEYS.ADDRESSES,
    queryFn: () => addressService.getAll(),
    enabled,
  });
}

export function useSaveAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Address>) => addressService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADDRESSES });
    },
  });
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => addressService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADDRESSES });
    },
  });
}

import { useAuth } from "@/context/AuthContext";
export { useAuth } from "@/context/AuthContext";

export function useUserProfile() {
  const { user, status, isLoading, isAuthenticated } = useAuth();
  return {
    data: user,
    user,
    status,
    isLoading,
    isAuthenticated,
  };
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: { name?: string; phone?: string }) =>
      authService.updateProfile(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_PROFILE });
    },
  });
}

export function useDeliveryConfig() {
  return useQuery({
    queryKey: ["delivery", "config"],
    queryFn: () => deliveryService.getConfig(),
    staleTime: 30 * 1000,
  });
}

export function useServiceability(pincode: string) {
  return useQuery({
    queryKey: QUERY_KEYS.SERVICEABILITY(pincode),
    queryFn: () => deliveryService.checkServiceability(pincode),
    enabled: !!pincode && pincode.trim().length === 6,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDeliverySlots(pincode: string, date: string) {
  return useQuery({
    queryKey: QUERY_KEYS.DELIVERY_SLOTS(pincode, date),
    queryFn: () => deliveryService.getSlots(pincode, date),
    enabled: !!pincode && !!date && pincode.trim().length === 6,
  });
}

export function useNotifications(isRead?: boolean, enabled: boolean = true) {
  return useQuery({
    queryKey: QUERY_KEYS.NOTIFICATIONS(isRead),
    queryFn: () => notificationService.getNotifications(isRead !== undefined ? { isRead } : undefined),
    enabled,
  });
}

export function useUnreadNotificationsCount(enabled: boolean = true) {
  return useQuery({
    queryKey: QUERY_KEYS.UNREAD_NOTIFICATIONS_COUNT,
    queryFn: () => notificationService.getUnreadCount(),
    enabled,
    refetchInterval: enabled ? 30000 : false, // periodic badge update
  });
}

export function useNotificationPreferences(enabled: boolean = true) {
  return useQuery({
    queryKey: QUERY_KEYS.NOTIFICATION_PREFERENCES,
    queryFn: () => notificationService.getPreferences(),
    enabled,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: { email?: boolean; whatsapp?: boolean; inApp?: boolean }) =>
      notificationService.updatePreferences(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATION_PREFERENCES });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_PROFILE });
    },
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      addressId: string;
      deliverySlotId?: string;
      couponCode?: string;
      paymentMethod: "RAZORPAY" | "COD" | "razorpay" | "cod";
    }) => orderService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORDERS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CART });
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      orderService.cancel(id, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORDER(variables.id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORDERS });
    },
  });
}

export function useVideos(filters?: VideoFilterOptions) {
  return useQuery({
    queryKey: QUERY_KEYS.VIDEOS(filters),
    queryFn: ({ signal }) => videoService.getAll(filters, signal),
    staleTime: 60 * 1000,
  });
}

export function useFeaturedVideos(limit = 6) {
  return useQuery({
    queryKey: QUERY_KEYS.FEATURED_VIDEOS(limit),
    queryFn: () => videoService.getFeatured(limit),
    staleTime: 5 * 60 * 1000,
  });
}

export function useVideo(slug: string) {
  return useQuery({
    queryKey: QUERY_KEYS.VIDEO(slug),
    queryFn: () => videoService.getBySlug(slug),
    enabled: !!slug,
    staleTime: 60 * 1000,
  });
}

