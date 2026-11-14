import { PaymentRecord } from "@/types";
import { orderService } from "./orderService";

export const paymentService = {
  async getAll(): Promise<PaymentRecord[]> {
    const orders = await orderService.getAll();

    return orders.map((o) => ({
      id: `pay-${o.id}`,
      orderId: o.id,
      customerName: o.customerName,
      amount: o.total,
      provider: o.paymentMethod,
      method: o.paymentMethod === "razorpay" ? "Razorpay (UPI / Card)" : "Cash on Delivery",
      status: o.paymentStatus,
      transactionRef: o.paymentMethod === "razorpay" ? `rzp_pay_${o.id.toLowerCase()}` : undefined,
      createdAt: o.createdAt,
    }));
  },

  async refund(paymentId: string, amount: number, reason: string): Promise<void> {
    // Paid orders refund / cancellation
    const orderNumber = paymentId.replace("pay-", "");
    await orderService.cancelOrder(orderNumber, reason || `Refund requested for Rs. ${amount}`);
  },
};
