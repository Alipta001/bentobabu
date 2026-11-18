import React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { orderService } from "@/services/orderService";
import { DownloadReceiptButton } from "@/components/order/DownloadReceiptButton";

interface OrderSuccessPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderSuccessPage({ params }: OrderSuccessPageProps) {
  const { id } = await params;
  const order = await orderService.getById(id);

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Header />

      <main className="flex-1 py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Success Banner */}
          <div className="bg-white rounded-3xl p-8 sm:p-12 border border-[#E5DFC5] shadow-xs text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#B99A60]">
              Order Confirmed & Sent to Kitchen
            </span>

            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#222922]">
              Thank You for Mindful Eating!
            </h1>

            <p className="text-xs sm:text-sm text-[#626F62] max-w-lg mx-auto leading-relaxed">
              Your wholesome meal is now being prepared fresh in our kitchen with pure ingredients
              and zero artificial preservatives.
            </p>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F7F3EA] border border-[#E5DFC5] text-xs font-mono font-bold text-[#354B35]">
              <span>Order ID: #{id}</span>
            </div>
          </div>

          {/* Details Card */}
          {order ? (
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E5DFC5] shadow-xs space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-6 border-b border-[#F0ECE1] text-xs">
                <div className="space-y-1">
                  <span className="text-[#8A9A86] font-semibold uppercase tracking-wider text-[10px]">
                    Estimated Delivery
                  </span>
                  <div className="flex items-center gap-1.5 font-bold text-[#354B35]">
                    <Clock className="w-4 h-4 text-[#B99A60]" />
                    <span>{order.estimatedDelivery || "35 - 45 mins"}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[#8A9A86] font-semibold uppercase tracking-wider text-[10px]">
                    Payment Mode
                  </span>
                  <div className="font-bold text-[#222922] uppercase">
                    {order.paymentMethod === "cod" ? "Cash / UPI on Delivery" : "Razorpay Online"}
                  </div>
                  <span className="text-[11px] text-emerald-700 font-semibold">
                    Status: {order.paymentStatus}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-[#8A9A86] font-semibold uppercase tracking-wider text-[10px]">
                    Kitchen Status
                  </span>
                  <div className="font-bold text-[#354B35] capitalize">
                    {order.status.replace("_", " ")}
                  </div>
                </div>
              </div>

              {/* Items Ordered */}
              <div className="space-y-3">
                <h3 className="font-serif font-bold text-base text-[#222922]">
                  Items in this Bento Box
                </h3>
                <div className="divide-y divide-[#F0ECE1]">
                  {order.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="py-3 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        {item.productImage && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.productImage}
                            alt={item.productName}
                            className="w-12 h-12 rounded-xl object-cover"
                          />
                        )}
                        <div>
                          <div className="font-bold text-[#222922]">
                            {item.quantity}x {item.productName}
                          </div>
                          <div className="text-[11px] text-[#6B776A]">
                            ₹{item.price} each
                          </div>
                        </div>
                      </div>
                      <span className="font-bold text-[#354B35]">
                        ₹{item.price * item.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Address & Bill Summary */}
              <div className="pt-4 border-t border-[#F0ECE1] grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
                <div className="space-y-2">
                  <h4 className="font-bold text-[#222922] flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#B99A60]" />
                    <span>Delivering To</span>
                  </h4>
                  <div className="text-[#626F62] leading-relaxed">
                    <p className="font-semibold text-[#222922]">
                      {order.deliveryAddress.name} ({order.deliveryAddress.phone})
                    </p>
                    <p>
                      {order.deliveryAddress.houseNo}, {order.deliveryAddress.street}
                    </p>
                    {order.deliveryAddress.landmark && (
                      <p>Near {order.deliveryAddress.landmark}</p>
                    )}
                    <p>
                      {order.deliveryAddress.city}, {order.deliveryAddress.state} -{" "}
                      {order.deliveryAddress.pincode}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 bg-[#F7F3EA] p-4 rounded-2xl border border-[#E5DFC5]">
                  <div className="flex justify-between text-[#626F62]">
                    <span>Subtotal</span>
                    <span>₹{order.subtotal}</span>
                  </div>
                  {order.discount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount</span>
                      <span>- ₹{order.discount}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[#626F62]">
                    <span>Delivery</span>
                    <span>{order.deliveryFee === 0 ? "FREE" : `₹${order.deliveryFee}`}</span>
                  </div>
                  <div className="flex justify-between text-[#626F62]">
                    <span>GST (5%)</span>
                    <span>₹{order.tax}</span>
                  </div>
                  <div className="pt-2 border-t border-[#E5DFC5] flex justify-between font-bold text-sm text-[#354B35]">
                    <span>Total</span>
                    <span>₹{order.total}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-6 border border-[#E5DFC5] text-center text-xs text-[#6B776A]">
              Order #{id} has been recorded. You can track its live kitchen progress under your account.
            </div>
          )}

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href={`/orders/${id}`}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-[#354B35] text-[#F7F3EA] text-xs font-bold shadow-md hover:bg-[#253525] transition-colors"
            >
              <span>Track Live Kitchen Progress</span>
              <ArrowRight className="w-4 h-4 text-[#B99A60]" />
            </Link>

            <DownloadReceiptButton
              orderId={id}
              orderNumber={order?.orderNumber}
              variant="outline"
              className="w-full sm:w-auto px-6 py-3.5 rounded-full border border-[#354B35] text-[#354B35] bg-transparent hover:bg-white"
            />

            <Link
              href="/menu"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full border border-gray-300 text-[#6B776A] text-xs font-bold hover:bg-white transition-colors"
            >
              <span>Explore More Dishes</span>
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
