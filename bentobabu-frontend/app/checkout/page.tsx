"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  Banknote,
  MapPin,
  User as UserIcon,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Plus,
  Lock,
  Truck,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { clearCart, setCartItems } from "@/store/cartSlice";
import {
  useAddresses,
  useSaveAddress,
  useServiceability,
  useDeliveryConfig,
} from "@/hooks/useQueries";
import { useAuth } from "@/context/AuthContext";
import { cartService } from "@/services/cartService";
import { orderService } from "@/services/orderService";
import { paymentService } from "@/services/paymentService";
import { DeliverySlotPicker } from "@/components/checkout/DeliverySlotPicker";
import { Address, DeliverySlot, CheckoutSummary } from "@/types";
import { buildLoginUrl, buildRegisterUrl } from "@/lib/authRedirect";

const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if ("Razorpay" in window) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

const SELECTED_ADDRESS_KEY = "bb_selected_address_id";

const getStoredAddressId = (): string => {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(SELECTED_ADDRESS_KEY) || "";
  } catch {
    return "";
  }
};

const setStoredAddressId = (id: string) => {
  if (typeof window === "undefined") return;
  try {
    if (id) {
      localStorage.setItem(SELECTED_ADDRESS_KEY, id);
    } else {
      localStorage.removeItem(SELECTED_ADDRESS_KEY);
    }
  } catch {
    // ignore
  }
};

export default function CheckoutPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const cartItems = useAppSelector((state) => state.cart.items);
  const appliedCoupon = useAppSelector((state) => state.cart.appliedCoupon);

  const { user: userProfile, status: authStatus, isLoading: isUserLoading } = useAuth();
  const {
    data: savedAddresses = [],
    isLoading: isAddressesLoading,
    refetch: refetchAddresses,
  } = useAddresses(authStatus === "authenticated");
  const saveAddressMutation = useSaveAddress();

  // Cart synchronization & hydration states
  const [isCartHydrated, setIsCartHydrated] = useState(false);
  const [isCartSyncing, setIsCartSyncing] = useState(true);
  const [cartSyncError, setCartSyncError] = useState("");

  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<DeliverySlot | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"RAZORPAY" | "COD">("COD");

  // New Address Drawer / Mode
  const [isAddingNewAddress, setIsAddingNewAddress] = useState(false);
  const [newAddressData, setNewAddressData] = useState({
    fullName: "",
    phone: "",
    houseNo: "",
    street: "",
    landmark: "",
    city: "Barrackpore",
    state: "West Bengal",
    pincode: "700120",
    addressType: "HOME" as "HOME" | "WORK" | "OTHER",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [checkoutSummary, setCheckoutSummary] = useState<CheckoutSummary | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);

  // Redirect unauthenticated guest user to login preserving full checkout path & query params
  useEffect(() => {
    if (authStatus === "unauthenticated" && typeof window !== "undefined") {
      const currentPath = window.location.pathname + window.location.search;
      router.replace(buildLoginUrl(currentPath));
    }
  }, [authStatus, router]);

  // Step 3 & 4: Fetch server cart & merge local items on mount / authentication
  useEffect(() => {
    let isCancelled = false;

    if (authStatus === "authenticated") {
      setIsCartSyncing(true);
      setCartSyncError("");

      // Read current Redux items (hydrated from localStorage on app boot)
      const localItems = cartItems;

      // Merge local items to MongoDB if any exist, otherwise fetch authoritative cart from MongoDB
      const cartPromise = localItems.length > 0
        ? cartService.mergeCart(localItems)
        : cartService.getCart();

      cartPromise
        .then(({ items }) => {
          if (!isCancelled) {
            dispatch(setCartItems(items));
            setIsCartHydrated(true);
            setIsCartSyncing(false);
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            console.error("[Checkout] Cart sync error:", err);
            setCartSyncError("Failed to synchronize cart with kitchen.");
            setIsCartHydrated(true);
            setIsCartSyncing(false);
          }
        });
    } else if (authStatus === "unauthenticated") {
      setIsCartSyncing(false);
      setIsCartHydrated(true);
    }

    return () => {
      isCancelled = true;
    };
  }, [authStatus]);

  // Step 5 & 6: Restore or select address when savedAddresses finish loading
  useEffect(() => {
    if (authStatus !== "authenticated" || isAddressesLoading) {
      return;
    }

    if (savedAddresses.length > 0) {
      const storedId = getStoredAddressId();
      // Match current selectedAddressId or previously stored preference
      const candidateId = selectedAddressId || storedId;
      const matched = savedAddresses.find((a) => a.id === candidateId || a._id === candidateId);

      if (matched) {
        const validId = matched.id || matched._id || "";
        if (validId && selectedAddressId !== validId) {
          setSelectedAddressId(validId);
        }
        if (validId) setStoredAddressId(validId);
      } else {
        // Fallback: default address or first address
        const fallback = savedAddresses.find((a) => a.isDefault) || savedAddresses[0];
        const validId = fallback?.id || fallback?._id || "";
        if (validId) {
          setSelectedAddressId(validId);
          setStoredAddressId(validId);
        }
      }
      setIsAddingNewAddress(false);
    } else {
      // Authenticated with zero saved addresses
      setSelectedAddressId("");
      setStoredAddressId("");
      setIsAddingNewAddress(true);
    }
  }, [authStatus, savedAddresses, isAddressesLoading]);

  // Handle explicit address selection by user
  const handleSelectAddress = (id: string) => {
    setSelectedAddressId(id);
    setStoredAddressId(id);
  };

  // Pre-fill user details into new address form if available
  useEffect(() => {
    if (userProfile && !newAddressData.fullName && !newAddressData.phone) {
      setNewAddressData((prev) => ({
        ...prev,
        fullName: userProfile.name || "",
        phone: userProfile.phone || "",
      }));
    }
  }, [userProfile, newAddressData.fullName, newAddressData.phone]);

  const activeAddress = useMemo(() => {
    return savedAddresses.find((a) => a.id === selectedAddressId || a._id === selectedAddressId) || null;
  }, [savedAddresses, selectedAddressId]);

  const activePincode = activeAddress
    ? activeAddress.pincode
    : newAddressData.pincode;

  // Live serviceability check for active address PIN
  const { data: serviceability, isLoading: isCheckingServiceability } =
    useServiceability(activePincode);
  const { data: deliveryConfig } = useDeliveryConfig();

  // Stable cart fingerprint: re-fetch checkout summary whenever items or quantities change
  const cartFingerprint = useMemo(
    () =>
      cartItems
        .map((it) => `${it.product.id ?? it.product._id}:${it.quantity}`)
        .sort()
        .join(","),
    [cartItems]
  );

  // Step 7: Live Authoritative Checkout Summary (only when cart is hydrated and has items, and address is selected)
  useEffect(() => {
    let isCancelled = false;

    if (isCartHydrated && !isCartSyncing && cartItems.length > 0 && selectedAddressId) {
      setIsSummaryLoading(true);
      setSummaryError("");
      cartService
        .getCheckoutSummary({
          addressId: selectedAddressId,
          deliverySlotId: selectedSlot ? (selectedSlot.id || selectedSlot._id) : undefined,
          couponCode: appliedCoupon?.code,
        })
        .then((summary) => {
          if (!isCancelled) {
            setCheckoutSummary(summary);
            setSummaryError("");
          }
        })
        .catch((err: any) => {
          if (!isCancelled) {
            console.error("Checkout summary error:", err);
            const msg = err?.response?.data?.message || err?.message || "Failed to calculate checkout summary";
            setSummaryError(msg);
          }
        })
        .finally(() => {
          if (!isCancelled) setIsSummaryLoading(false);
        });
    } else if (cartItems.length === 0) {
      setCheckoutSummary(null);
    }

    return () => {
      isCancelled = true;
    };
  }, [isCartHydrated, isCartSyncing, cartFingerprint, selectedAddressId, selectedSlot, appliedCoupon]);

  // Fallback calculation if backend summary pending
  const clientSubtotal = cartItems.reduce(
    (acc, item) => acc + item.product.price * item.quantity,
    0
  );
  const clientDiscount = appliedCoupon
    ? appliedCoupon.discountType === "PERCENTAGE"
      ? Math.min(
          Math.round((clientSubtotal * appliedCoupon.discountValue) / 100),
          appliedCoupon.maximumDiscount || Infinity
        )
      : appliedCoupon.discountValue
    : 0;
  const clientDelivery = serviceability?.deliveryFee ?? 0;
  const clientTax = 0; // Food standard or included
  const clientTotal = Math.max(0, clientSubtotal - clientDiscount + clientDelivery + clientTax);

  const finalSubtotal = checkoutSummary?.itemTotal ?? clientSubtotal;
  const finalDiscount = checkoutSummary?.couponDiscount ?? clientDiscount;
  const finalDelivery = checkoutSummary?.deliveryCharge ?? clientDelivery;
  const finalTax = checkoutSummary?.taxAmount ?? clientTax;
  const finalTotal = checkoutSummary?.grandTotal ?? clientTotal;

  const minimumOrderValue =
    checkoutSummary?.minimumOrderValue ??
    (serviceability?.minimumOrderAmount ?? deliveryConfig?.minimumOrderValue ?? 0);
  const isBelowMinimum = minimumOrderValue > 0 && finalSubtotal < minimumOrderValue;
  const shortfall = isBelowMinimum ? minimumOrderValue - finalSubtotal : 0;

  // Save new address handler
  const handleSaveNewAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    const phoneClean = newAddressData.phone.replace(/[\s\-+]/g, "").slice(-10);
    if (!/^\d{10}$/.test(phoneClean)) {
      setErrorMessage("Please enter a valid 10-digit Indian phone number.");
      return;
    }
    if (!/^\d{6}$/.test(newAddressData.pincode.trim())) {
      setErrorMessage("Please enter a valid 6-digit delivery PIN code.");
      return;
    }
    if (!newAddressData.houseNo.trim() || !newAddressData.street.trim()) {
      setErrorMessage("Please enter your complete house/building and street address.");
      return;
    }

    try {
      const created = await saveAddressMutation.mutateAsync({
        fullName: newAddressData.fullName,
        phone: phoneClean,
        addressLine: `${newAddressData.houseNo}, ${newAddressData.street}`,
        houseNo: newAddressData.houseNo,
        street: newAddressData.street,
        landmark: newAddressData.landmark,
        city: newAddressData.city,
        state: newAddressData.state,
        pincode: newAddressData.pincode.trim(),
        addressType: newAddressData.addressType,
        isDefault: savedAddresses.length === 0,
      });

      await refetchAddresses();
      const newId = created.id || (created as any)._id;
      setSelectedAddressId(newId);
      setStoredAddressId(newId);
      setIsAddingNewAddress(false);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to save delivery address."
      );
    }
  };

  // Main Submit Order Handler
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage("");

    if (!userProfile) {
      const currentPath = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/checkout";
      router.replace(buildLoginUrl(currentPath));
      return;
    }

    if (cartItems.length === 0) {
      setErrorMessage("Your cart is empty. Please add items before checking out.");
      return;
    }

    if (!selectedAddressId) {
      setErrorMessage("Please select or save a delivery address.");
      return;
    }

    if (serviceability && !serviceability.serviceable) {
      setErrorMessage(
        serviceability.message ||
          "Delivery is currently not available to this PIN code. Please select a serviceable address."
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Authoritative order placement on backend (/orders)
      const createdOrder = await orderService.create({
        addressId: selectedAddressId,
        deliverySlotId: selectedSlot ? (selectedSlot.id || selectedSlot._id) : undefined,
        couponCode: appliedCoupon?.code,
        paymentMethod,
      });

      // 2. Online Payment Gateway (Razorpay)
      if (paymentMethod === "RAZORPAY") {
        const scriptLoaded = await loadRazorpayScript();
        if (!scriptLoaded) {
          setErrorMessage(
            "Could not load Razorpay secure checkout. Please check your internet connection or switch to Cash on Delivery."
          );
          setIsSubmitting(false);
          return;
        }

        // Fetch Razorpay order details from backend
        let rzpOrderInfo;
        try {
          rzpOrderInfo = await paymentService.createRazorpayOrder(createdOrder.id);
        } catch (gatewayErr: unknown) {
          setIsSubmitting(false);
          setErrorMessage(
            gatewayErr instanceof Error
              ? gatewayErr.message
              : "Failed to initialize payment gateway. Please try Cash on Delivery."
          );
          return;
        }

        const options = {
          key: rzpOrderInfo.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_placeholder",
          amount: rzpOrderInfo.amount,
          currency: rzpOrderInfo.currency || "INR",
          name: "BentoBabu Kitchen",
          description: `Bento Order #${createdOrder.orderNumber || createdOrder.id}`,
          order_id: rzpOrderInfo.razorpayOrderId,
          handler: async function (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) {
            try {
              setIsSubmitting(true);
              const verifyRes = await paymentService.verifyPayment({
                orderId: createdOrder.id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });

              if (verifyRes.success) {
                dispatch(clearCart());
                router.push(`/order-success/${createdOrder.id}`);
              } else {
                setErrorMessage(
                  verifyRes.message || "Payment verification failed. Please contact kitchen support."
                );
                setIsSubmitting(false);
              }
            } catch (vErr: unknown) {
              setIsSubmitting(false);
              setErrorMessage(
                vErr instanceof Error
                  ? vErr.message
                  : "Payment verification failed with your bank."
              );
            }
          },
          modal: {
            ondismiss: function () {
              setIsSubmitting(false);
              setErrorMessage(
                "Payment was not completed. You can view this order in your account or retry payment."
              );
            },
          },
          prefill: {
            name: userProfile.name,
            email: userProfile.email,
            contact: userProfile.phone || "",
          },
          theme: { color: "#354B35" },
        };

        // @ts-expect-error Razorpay attached to window
        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", function (failRes: { error?: { description?: string } }) {
          setIsSubmitting(false);
          setErrorMessage(
            `Payment declined: ${failRes.error?.description || "Transaction failed."}`
          );
        });
        rzp.open();
        return;
      }

      // 3. Cash on Delivery (COD)
      try {
        await paymentService.confirmCodOrder(createdOrder.id);
      } catch {
        // Even if COD confirmation endpoint was optional, backend set status to CONFIRMED
      }

      dispatch(clearCart());
      router.push(`/order-success/${createdOrder.id}`);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to place your order. Please check address and serviceability."
      );
      setIsSubmitting(false);
    }
  };

  // Authentication & Cart Hydration Loading Guard
  if (authStatus === "loading" || isCartSyncing || (!isCartHydrated && authStatus === "authenticated")) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
        <Header />
        <main className="flex-1 py-16 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 border border-[#E5DFC5] text-center max-w-md space-y-4 shadow-xs">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#354B35]" />
            <h2 className="font-serif text-xl font-bold text-[#222922]">
              Preparing Your Checkout...
            </h2>
            <p className="text-xs text-[#6B776A]">
              Restoring your cart and delivery preferences securely.
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Genuine Empty Cart State (only rendered when cart is fully hydrated and confirmed empty)
  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
        <Header />
        <main className="flex-1 py-16 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 border border-[#E5DFC5] text-center max-w-md space-y-4 shadow-xs">
            <h2 className="font-serif text-2xl font-bold text-[#222922]">
              Your Cart is Empty
            </h2>
            <p className="text-xs text-[#6B776A]">
              Add nourishing bento meals before heading to checkout.
            </p>
            <Link
              href="/menu"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-semibold"
            >
              Browse Menu
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Unauthenticated Banner Guard
  if (!userProfile && !isUserLoading) {
    const currentPath = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/checkout";
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
        <Header />
        <main className="flex-1 py-16 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 border border-[#E5DFC5] text-center max-w-md space-y-4 shadow-xs">
            <Lock className="w-12 h-12 text-[#B99A60] mx-auto" />
            <h2 className="font-serif text-2xl font-bold text-[#222922]">
              Sign In to Continue
            </h2>
            <p className="text-xs text-[#6B776A] leading-relaxed">
              Please sign in or create an account to link your delivery address, live kitchen tracking, and reward coupons.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <Link
                href={buildLoginUrl(currentPath)}
                className="px-6 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525]"
              >
                Sign In
              </Link>
              <Link
                href={buildRegisterUrl(currentPath)}
                className="px-6 py-2.5 rounded-full border border-[#354B35] text-[#354B35] text-xs font-semibold hover:bg-[#F7F3EA]"
              >
                Create Account
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Header />

      <main className="flex-1 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Breadcrumb */}
          <Link
            href="/cart"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#354B35] hover:text-[#B99A60] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Bento Cart</span>
          </Link>

          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-widest text-[#B99A60]">
              Secure Order Placement
            </span>
            <h1 className="font-serif text-3xl font-bold text-[#222922]">
              Checkout & Delivery Details
            </h1>
          </div>

          {errorMessage && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmitOrder}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Address, Slot & Payment */}
              <div className="lg:col-span-8 space-y-6">
                {/* 1. Delivery Address Section */}
                <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E5DFC5] shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE1]">
                    <div className="flex items-center gap-2 font-serif font-bold text-lg text-[#222922]">
                      <MapPin className="w-5 h-5 text-[#B99A60]" />
                      <span>1. Delivery Address</span>
                    </div>

                    {!isAddingNewAddress && (
                      <button
                        type="button"
                        onClick={() => setIsAddingNewAddress(true)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#354B35] hover:text-[#B99A60] cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add New Address</span>
                      </button>
                    )}
                  </div>

                    {isAddressesLoading ? (
                      <div className="p-8 text-center space-y-2 border border-[#E5DFC5] rounded-2xl bg-white/50">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#354B35]" />
                        <p className="text-xs text-[#6B776A]">Loading your saved delivery addresses...</p>
                      </div>
                    ) : isAddingNewAddress ? (
                    <div className="p-5 rounded-2xl border-2 border-[#354B35] bg-[#F7F3EA]/30 space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="font-serif font-bold text-sm text-[#222922]">
                          Enter Delivery Location
                        </span>
                        {savedAddresses.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setIsAddingNewAddress(false)}
                            className="text-xs text-gray-500 hover:text-gray-800 underline cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <input
                          type="text"
                          required
                          placeholder="Recipient Full Name"
                          value={newAddressData.fullName}
                          onChange={(e) =>
                            setNewAddressData({ ...newAddressData, fullName: e.target.value })
                          }
                          className="px-3.5 py-2.5 rounded-xl bg-white border border-[#E5DFC5] text-[#222922]"
                        />
                        <input
                          type="tel"
                          required
                          placeholder="10-digit Phone Number"
                          value={newAddressData.phone}
                          onChange={(e) =>
                            setNewAddressData({ ...newAddressData, phone: e.target.value })
                          }
                          className="px-3.5 py-2.5 rounded-xl bg-white border border-[#E5DFC5] text-[#222922]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <input
                          type="text"
                          required
                          placeholder="Flat / House / Building"
                          value={newAddressData.houseNo}
                          onChange={(e) =>
                            setNewAddressData({ ...newAddressData, houseNo: e.target.value })
                          }
                          className="px-3.5 py-2.5 rounded-xl bg-white border border-[#E5DFC5] text-[#222922]"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Street / Locality / Sector"
                          value={newAddressData.street}
                          onChange={(e) =>
                            setNewAddressData({ ...newAddressData, street: e.target.value })
                          }
                          className="px-3.5 py-2.5 rounded-xl bg-white border border-[#E5DFC5] text-[#222922]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <input
                          type="text"
                          placeholder="Landmark (Optional)"
                          value={newAddressData.landmark}
                          onChange={(e) =>
                            setNewAddressData({ ...newAddressData, landmark: e.target.value })
                          }
                          className="px-3.5 py-2.5 rounded-xl bg-white border border-[#E5DFC5] text-[#222922]"
                        />
                        <input
                          type="text"
                          required
                          placeholder="City"
                          value={newAddressData.city}
                          onChange={(e) =>
                            setNewAddressData({ ...newAddressData, city: e.target.value })
                          }
                          className="px-3.5 py-2.5 rounded-xl bg-white border border-[#E5DFC5] text-[#222922]"
                        />
                        <input
                          type="text"
                          required
                          maxLength={6}
                          placeholder="6-digit PIN Code"
                          value={newAddressData.pincode}
                          onChange={(e) =>
                            setNewAddressData({
                              ...newAddressData,
                              pincode: e.target.value.replace(/\D/g, ""),
                            })
                          }
                          className="px-3.5 py-2.5 rounded-xl bg-white border border-[#E5DFC5] text-[#222922] font-mono font-bold"
                        />
                      </div>

                      <div className="flex items-center gap-4 text-xs pt-1">
                        <span className="font-semibold text-[#626F62]">Type:</span>
                        {(["HOME", "WORK", "OTHER"] as const).map((type) => (
                          <label key={type} className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name="addressType"
                              value={type}
                              checked={newAddressData.addressType === type}
                              onChange={() =>
                                setNewAddressData({ ...newAddressData, addressType: type })
                              }
                              className="text-[#354B35]"
                            />
                            <span>{type}</span>
                          </label>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={handleSaveNewAddress}
                        disabled={saveAddressMutation.isPending}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                      >
                        {saveAddressMutation.isPending && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        )}
                        <span>Save & Use Address</span>
                      </button>
                    </div>
                  ) : (
                    /* Saved Address Radio Grid */
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {savedAddresses.map((addr) => {
                        const isSelected = selectedAddressId === addr.id || selectedAddressId === addr._id;
                        return (
                          <div
                            key={addr.id || addr._id}
                            onClick={() => handleSelectAddress(addr.id || addr._id || "")}
                            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative ${
                              isSelected
                                ? "border-[#354B35] bg-[#EBF0E9] shadow-xs"
                                : "border-[#E5DFC5] bg-[#F7F3EA] hover:border-[#8A9A86]"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold uppercase text-[#354B35]">
                                {addr.type}
                              </span>
                              {isSelected && (
                                <CheckCircle2 className="w-4 h-4 text-[#354B35]" />
                              )}
                            </div>
                            <div className="text-xs font-bold text-[#222922] mt-1.5">
                              {addr.name} ({addr.phone})
                            </div>
                            <div className="text-xs text-[#222922] mt-0.5 truncate">
                              {addr.houseNo}, {addr.street}
                            </div>
                            <div className="text-[11px] text-[#6B776A] mt-0.5">
                              {addr.city} - <strong className="font-mono">{addr.pincode}</strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Serviceability Alert */}
                  {isCheckingServiceability ? (
                    <div className="text-xs text-[#8A9A86] flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B99A60]" />
                      <span>Checking delivery serviceability for PIN {activePincode}...</span>
                    </div>
                  ) : serviceability && !serviceability.serviceable ? (
                    <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>
                        PIN code {activePincode} is not currently serviceable by our kitchen. Please choose an address in our delivery zones (e.g. Barrackpore 700120–700123).
                      </span>
                    </div>
                  ) : serviceability?.serviceable ? (
                    <div className="p-3 rounded-xl bg-[#EBF0E9] text-xs text-[#354B35] flex items-center gap-2">
                      <Truck className="w-4 h-4 text-[#354B35] shrink-0" />
                      <span>
                        Serviceable to <strong>{serviceability.zone?.name || "Kitchen Zone"}</strong> • Estimated delivery in <strong>{serviceability.estimatedDeliveryTime || serviceability.zone?.estimatedDeliveryTime || "35 mins"}</strong>
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* 2. Delivery Slot Picker */}
                <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E5DFC5] shadow-xs space-y-4">
                  <div className="flex items-center gap-2 font-serif font-bold text-lg text-[#222922] pb-3 border-b border-[#F0ECE1]">
                    <Clock className="w-5 h-5 text-[#B99A60]" />
                    <span>2. Delivery Slot</span>
                  </div>

                  <DeliverySlotPicker
                    pincode={activePincode}
                    selectedSlotId={selectedSlot ? (selectedSlot.id || selectedSlot._id) : undefined}
                    onSelectSlot={(slot) => setSelectedSlot(slot)}
                  />
                </div>

                {/* 3. Payment Method */}
                <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E5DFC5] shadow-xs space-y-4">
                  <div className="flex items-center gap-2 font-serif font-bold text-lg text-[#222922] pb-3 border-b border-[#F0ECE1]">
                    <CreditCard className="w-5 h-5 text-[#B99A60]" />
                    <span>3. Payment Method</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label
                      className={`p-4 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                        paymentMethod === "COD"
                          ? "border-[#354B35] bg-[#EBF0E9]"
                          : "border-[#E5DFC5] bg-[#F7F3EA]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="COD"
                        checked={paymentMethod === "COD"}
                        onChange={() => setPaymentMethod("COD")}
                        className="mt-1 text-[#354B35] focus:ring-[#354B35]"
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 font-bold text-xs text-[#222922]">
                          <Banknote className="w-4 h-4 text-[#354B35]" />
                          <span>Cash / UPI on Delivery</span>
                        </div>
                        <div className="text-[11px] text-[#6B776A] leading-relaxed">
                          Pay cash or scan QR upon verified doorstep delivery with OTP verification.
                        </div>
                      </div>
                    </label>

                    <label
                      className={`p-4 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                        paymentMethod === "RAZORPAY"
                          ? "border-[#354B35] bg-[#EBF0E9]"
                          : "border-[#E5DFC5] bg-[#F7F3EA]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="RAZORPAY"
                        checked={paymentMethod === "RAZORPAY"}
                        onChange={() => setPaymentMethod("RAZORPAY")}
                        className="mt-1 text-[#354B35] focus:ring-[#354B35]"
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 font-bold text-xs text-[#222922]">
                          <CreditCard className="w-4 h-4 text-[#B99A60]" />
                          <span>Razorpay Online (UPI, Cards, NetBanking)</span>
                        </div>
                        <div className="text-[11px] text-[#6B776A] leading-relaxed">
                          Secure instant bank verification with 256-bit SSL encryption.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Right Column: Order Summary & Place Order */}
              <div className="lg:col-span-4 space-y-6 sticky top-28">
                <div className="bg-white rounded-3xl p-6 border border-[#E5DFC5] shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE1]">
                    <h3 className="font-serif text-lg font-bold text-[#222922]">
                      Order Summary
                    </h3>
                    {isSummaryLoading && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B99A60]" />
                    )}
                  </div>

                  {summaryError && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{summaryError}</span>
                    </div>
                  )}

                  {/* Items list preview */}
                  <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                    {cartItems.map((item) => (
                      <div
                        key={item.product.id}
                        className="flex items-center justify-between text-xs"
                      >
                        <div className="flex-1 pr-2 truncate">
                          <span className="font-bold text-[#354B35]">
                            {item.quantity}x
                          </span>{" "}
                          <span className="text-[#222922]">{item.product.name}</span>
                        </div>
                        <span className="font-bold text-[#222922]">
                          ₹{item.product.price * item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Bill Breakdown */}
                  <div className="pt-3 border-t border-[#F0ECE1] space-y-2 text-xs text-[#626F62]">
                    <div className="flex justify-between">
                      <span>Item Subtotal</span>
                      <span className="text-[#222922]">₹{finalSubtotal}</span>
                    </div>

                    {finalDiscount > 0 && (
                      <div className="flex justify-between text-emerald-700 font-medium">
                        <span>Coupon Discount ({appliedCoupon?.code})</span>
                        <span>- ₹{finalDiscount}</span>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <span>Delivery Fee</span>
                      <span>
                        {finalDelivery === 0 ? "FREE" : `₹${finalDelivery}`}
                      </span>
                    </div>

                    {finalTax > 0 && (
                      <div className="flex justify-between">
                        <span>GST / Taxes</span>
                        <span>₹{finalTax}</span>
                      </div>
                    )}
                  </div>

                  {/* Total */}
                  <div className="pt-3 border-t border-[#F0ECE1] flex items-baseline justify-between">
                    <span className="font-serif font-bold text-base text-[#222922]">
                      Total Payable
                    </span>
                    <span className="font-serif font-bold text-2xl text-[#354B35]">
                      ₹{finalTotal}
                    </span>
                  </div>

                  {isBelowMinimum && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold block">Minimum order value is ₹{minimumOrderValue}.</span>
                        <span className="text-[11px] text-amber-800">Add ₹{shortfall} more to continue.</span>
                      </div>
                    </div>
                  )}

                  {summaryError && !isBelowMinimum && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2 text-xs text-rose-800">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{summaryError}</span>
                    </div>
                  )}

                  {/* Place Order CTA */}
                  <button
                    type="submit"
                    disabled={isSubmitting || isBelowMinimum || (serviceability && !serviceability.serviceable)}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-full bg-[#354B35] text-[#F7F3EA] text-sm font-bold shadow-md hover:bg-[#253525] disabled:opacity-50 cursor-pointer transition-all"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-[#B99A60]" />
                        <span>Confirming Order...</span>
                      </>
                    ) : isBelowMinimum ? (
                      <span>Minimum Order ₹{minimumOrderValue} (Add ₹{shortfall})</span>
                    ) : (
                      <>
                        <span>Place Order • ₹{finalTotal}</span>
                        <ArrowRight className="w-4 h-4 text-[#B99A60]" />
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-center gap-2 text-[11px] text-[#8A9A86] pt-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#354B35]" />
                    <span>Safe & Verified Ordering Guarantee</span>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      </main>

      <Footer />
    </div>
  );
}
