import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { deliveryApi, GetOrdersParams } from "@/lib/api/delivery.api";
import { earningsApi } from "@/lib/api/earnings.api";
import { notificationApi } from "@/lib/api/notification.api";
import { useAppSelector } from "@/store/hooks";

export const QUERY_KEYS = {
  ORDERS: (params?: GetOrdersParams) => ["delivery-orders", params],
  NEW_REQUESTS: ["delivery-orders", "READY_FOR_PICKUP"],
  ACTIVE_DELIVERIES: ["delivery-orders", "OUT_FOR_DELIVERY"],
  DELIVERY_HISTORY: (params?: GetOrdersParams) => ["delivery-orders", "DELIVERED", params],
  ORDER_DETAIL: (id: string) => ["order-detail", id],
  EARNINGS: ["delivery-earnings"],
  NOTIFICATIONS: (params?: { isRead?: boolean; page?: number }) => ["notifications", params],
  UNREAD_NOTIFICATIONS_COUNT: ["notifications", "unread-count"],
};

export function useDeliveryOrders(params?: GetOrdersParams) {
  const isOnline = useAppSelector((state) => state.delivery.isOnline);

  return useQuery({
    queryKey: QUERY_KEYS.ORDERS(params),
    queryFn: () => deliveryApi.getDeliveryOrders(params),
    enabled: isOnline,
    refetchInterval: isOnline ? 15000 : false, // Poll every 15s when online
  });
}

export function useNewRequests() {
  const isOnline = useAppSelector((state) => state.delivery.isOnline);

  return useQuery({
    queryKey: QUERY_KEYS.NEW_REQUESTS,
    queryFn: () => deliveryApi.getDeliveryOrders({ status: "READY_FOR_PICKUP", limit: 30 }),
    enabled: isOnline,
    refetchInterval: isOnline ? 10000 : false, // Frequent polling for incoming assignments
  });
}

export function useActiveDeliveries() {
  const isOnline = useAppSelector((state) => state.delivery.isOnline);

  return useQuery({
    queryKey: QUERY_KEYS.ACTIVE_DELIVERIES,
    queryFn: () => deliveryApi.getDeliveryOrders({ status: "OUT_FOR_DELIVERY", limit: 20 }),
    enabled: isOnline,
    refetchInterval: isOnline ? 12000 : false,
  });
}

export function useDeliveryHistory(params?: GetOrdersParams) {
  return useQuery({
    queryKey: QUERY_KEYS.DELIVERY_HISTORY(params),
    queryFn: () => deliveryApi.getDeliveryOrders({ status: "DELIVERED", ...params }),
    staleTime: 30000,
  });
}

export function useOrderDetails(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.ORDER_DETAIL(id),
    queryFn: () => deliveryApi.getOrderById(id),
    enabled: !!id,
    staleTime: 5000,
  });
}

export function useEarnings() {
  return useQuery({
    queryKey: QUERY_KEYS.EARNINGS,
    queryFn: () => earningsApi.getEarningsStats(),
    staleTime: 30000,
  });
}

export function useAcceptAndPickupOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      deliveryApi.acceptAndPickupOrder(id, note),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["delivery-orders"] });
      queryClient.setQueryData(QUERY_KEYS.ORDER_DETAIL(data.id || data._id), data);
    },
  });
}

export function useDeliveryConfig() {
  return useQuery({
    queryKey: ["delivery-config"],
    queryFn: () => deliveryApi.getDeliveryConfig(),
    staleTime: 60000,
  });
}

export function useVerifyDeliveryOtp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, otp, note }: { id: string; otp?: string; note?: string }) =>
      deliveryApi.verifyDeliveryOtp(id, otp, note),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["delivery-orders"] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.EARNINGS });
      queryClient.setQueryData(QUERY_KEYS.ORDER_DETAIL(data.id || data._id), data);
    },
  });
}

export function useNotifications(params?: { isRead?: boolean; page?: number }) {
  return useQuery({
    queryKey: QUERY_KEYS.NOTIFICATIONS(params),
    queryFn: () => notificationApi.getNotifications(params),
    refetchInterval: 30000,
  });
}

export function useUnreadNotificationsCount() {
  return useQuery({
    queryKey: QUERY_KEYS.UNREAD_NOTIFICATIONS_COUNT,
    queryFn: () => notificationApi.getUnreadCount(),
    refetchInterval: 20000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificationApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
