import { deliveryApi } from "./delivery.api";
import { EarningsStats, Order } from "@/types";

export const earningsApi = {
  /**
   * Derives real earnings statistics and transactions from authenticated agent's delivered orders
   */
  async getEarningsStats(): Promise<EarningsStats> {
    const response = await deliveryApi.getDeliveryOrders({
      status: "DELIVERED",
      limit: 100,
    });

    const orders = response.data || [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = todayStart - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = todayStart - 30 * 24 * 60 * 60 * 1000;

    let todayEarnings = 0;
    let todayDeliveries = 0;
    let weeklyEarnings = 0;
    let weeklyDeliveries = 0;
    let monthlyEarnings = 0;
    let monthlyDeliveries = 0;
    let totalEarnings = 0;

    const BASE_DELIVERY_PAY = 50; // Guaranteed base payout per delivery
    const DISTANCE_INCENTIVE = 10; // Extra peak/distance incentive

    const transactions = orders.map((order: Order) => {
      // Find delivery timestamp from statusHistory or updatedAt
      const deliveredEvent = order.statusHistory?.find(
        (h) => h.status === "DELIVERED"
      );
      const deliveredTime = deliveredEvent
        ? new Date(deliveredEvent.changedAt).getTime()
        : new Date(order.updatedAt).getTime();

      const deliveryFee = order.deliveryCharge > 0 ? order.deliveryCharge : BASE_DELIVERY_PAY;
      const incentive = DISTANCE_INCENTIVE;
      const totalEarned = deliveryFee + incentive;

      totalEarnings += totalEarned;

      if (deliveredTime >= todayStart) {
        todayEarnings += totalEarned;
        todayDeliveries += 1;
      }
      if (deliveredTime >= sevenDaysAgo) {
        weeklyEarnings += totalEarned;
        weeklyDeliveries += 1;
      }
      if (deliveredTime >= thirtyDaysAgo) {
        monthlyEarnings += totalEarned;
        monthlyDeliveries += 1;
      }

      return {
        orderId: order.id || order._id,
        orderNumber: order.orderNumber,
        deliveredAt: deliveredEvent?.changedAt || order.updatedAt,
        amount: order.grandTotal,
        deliveryFee,
        incentive,
        paymentMethod: order.paymentMethod,
      };
    });

    const totalDeliveries = orders.length;
    const averageEarningsPerDelivery =
      totalDeliveries > 0 ? Math.round(totalEarnings / totalDeliveries) : 0;

    return {
      todayEarnings,
      todayDeliveries,
      weeklyEarnings,
      weeklyDeliveries,
      monthlyEarnings,
      monthlyDeliveries,
      totalEarnings,
      totalDeliveries,
      averageEarningsPerDelivery,
      transactions,
    };
  },
};
