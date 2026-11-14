"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  User as UserIcon,
  Package,
  MapPin,
  LogOut,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Bike,
  Bell,
  Check,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import {
  useOrders,
  useAddresses,
  useSaveAddress,
  useUserProfile,
  useUpdateProfile,
  QUERY_KEYS,
} from "@/hooks/useQueries";
import { authService } from "@/services/authService";
import { addressService } from "@/services/addressService";
import { useQueryClient } from "@tanstack/react-query";
import { buildLoginUrl } from "@/lib/authRedirect";

function AccountTabSync({
  onTabSync,
}: {
  onTabSync: (tab: "orders" | "addresses" | "profile") => void;
}) {
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  useEffect(() => {
    if (urlTab === "orders" || urlTab === "addresses" || urlTab === "profile") {
      onTabSync(urlTab);
    }
  }, [urlTab, onTabSync]);
  return null;
}

function AccountContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"orders" | "addresses" | "profile">("orders");
  const { data: user, isLoading: isUserLoading } = useUserProfile();

  const handleTabSync = React.useCallback((tab: "orders" | "addresses" | "profile") => {
    setActiveTab(tab);
  }, []);

  // Profile Edit State
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [profileSuccessMsg, setProfileSuccessMsg] = useState("");
  const [profileErrorMsg, setProfileErrorMsg] = useState("");
  const updateProfileMutation = useUpdateProfile();

  // New Address State
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [newAddr, setNewAddr] = useState({
    fullName: "",
    phone: "",
    houseNo: "",
    street: "",
    landmark: "",
    city: "Barrackpore",
    state: "West Bengal",
    pincode: "700120",
    addressType: "HOME" as "HOME" | "WORK" | "OTHER",
    isDefault: false,
  });

  const { data: orders = [], isLoading: isOrdersLoading } = useOrders(!!user);
  const { data: addresses = [], refetch: refetchAddresses } = useAddresses(!!user);
  const saveAddressMutation = useSaveAddress();

  useEffect(() => {
    if (!isUserLoading && !user && typeof window !== "undefined") {
      const currentPath = window.location.pathname + window.location.search;
      router.replace(buildLoginUrl(currentPath));
    }
    if (user) {
      setNameInput(user.name || "");
      setPhoneInput(user.phone || "");
    }
  }, [isUserLoading, user, router]);

  const handleLogout = async () => {
    await authService.logout();
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_PROFILE });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORDERS });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADDRESSES });
    router.push("/");
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccessMsg("");
    setProfileErrorMsg("");

    const phoneClean = phoneInput.replace(/[\s\-+]/g, "").slice(-10);
    if (phoneClean && !/^[6-9]\d{9}$/.test(phoneClean)) {
      setProfileErrorMsg("Please enter a valid 10-digit Indian phone number.");
      return;
    }

    try {
      await updateProfileMutation.mutateAsync({
        name: nameInput.trim(),
        phone: phoneClean,
      });
      setProfileSuccessMsg("Profile updated successfully!");
      setTimeout(() => setProfileSuccessMsg(""), 3000);
    } catch (err: unknown) {
      setProfileErrorMsg(
        err instanceof Error ? err.message : "Failed to update profile."
      );
    }
  };

  const handleCreateAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddressError("");

    const phoneClean = (newAddr.phone || user?.phone || "")
      .replace(/[\s\-+]/g, "")
      .slice(-10);

    if (!/^[6-9]\d{9}$/.test(phoneClean)) {
      setAddressError("Please enter a valid 10-digit phone number.");
      return;
    }

    if (!/^\d{6}$/.test(newAddr.pincode.trim())) {
      setAddressError("Please enter a valid 6-digit PIN code.");
      return;
    }

    try {
      await saveAddressMutation.mutateAsync({
        fullName: newAddr.fullName || user?.name || "Customer",
        phone: phoneClean,
        addressLine: `${newAddr.houseNo}, ${newAddr.street}`,
        houseNo: newAddr.houseNo,
        street: newAddr.street,
        landmark: newAddr.landmark,
        city: newAddr.city,
        state: newAddr.state,
        pincode: newAddr.pincode.trim(),
        addressType: newAddr.addressType,
        isDefault: newAddr.isDefault || addresses.length === 0,
      });

      setShowAddAddress(false);
      setNewAddr({
        fullName: "",
        phone: "",
        houseNo: "",
        street: "",
        landmark: "",
        city: "Barrackpore",
        state: "West Bengal",
        pincode: "700120",
        addressType: "HOME",
        isDefault: false,
      });
      refetchAddresses();
    } catch (err: unknown) {
      setAddressError(
        err instanceof Error ? err.message : "Failed to save address."
      );
    }
  };

  const handleDeleteAddress = async (id: string) => {
    if (confirm("Delete this saved address?")) {
      try {
        await addressService.delete(id);
        refetchAddresses();
      } catch (err) {
        console.error("Failed to delete address:", err);
      }
    }
  };

  if (isUserLoading || !user) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
        <Header />
        <main className="flex-1 py-16 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-xs text-[#6B776A]">
            <Loader2 className="w-6 h-6 animate-spin text-[#B99A60]" />
            <span>Loading your member profile...</span>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Suspense fallback={null}>
        <AccountTabSync onTabSync={handleTabSync} />
      </Suspense>
      <Header />

      <main className="flex-1 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {/* User Profile Banner */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E5DFC5] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[#354B35] text-[#F7F3EA] flex items-center justify-center font-serif text-2xl font-bold shadow-xs">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#B99A60]">
                  Verified Bento Member
                </span>
                <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#222922]">
                  {user.name}
                </h1>
                <div className="text-xs text-[#6B776A] flex flex-wrap gap-2 items-center">
                  <span>{user.email}</span>
                  {user.phone && (
                    <>
                      <span>•</span>
                      <span>{user.phone}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/notifications"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#E5DFC5] text-xs font-semibold text-[#354B35] hover:bg-[#F7F3EA] transition-colors cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5 text-[#B99A60]" />
                <span>Notifications</span>
              </Link>

              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-50 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 border-b border-[#E5DFC5] pb-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab("orders")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === "orders"
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "bg-white text-[#626F62] hover:bg-[#EDE8DE]"
              }`}
            >
              <Package className="w-4 h-4" />
              <span>My Orders ({orders.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("addresses")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === "addresses"
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "bg-white text-[#626F62] hover:bg-[#EDE8DE]"
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span>Saved Addresses ({addresses.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === "profile"
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "bg-white text-[#626F62] hover:bg-[#EDE8DE]"
              }`}
            >
              <UserIcon className="w-4 h-4" />
              <span>Account Settings</span>
            </button>
          </div>

          {/* Tab 1: Orders History */}
          {activeTab === "orders" && (
            <div className="space-y-4">
              {isOrdersLoading ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-[#E5DFC5] text-xs text-[#6B776A] flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#B99A60]" />
                  <span>Fetching your orders...</span>
                </div>
              ) : orders.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-[#E5DFC5] space-y-3">
                  <div className="w-16 h-16 rounded-full bg-[#EDE8DE] flex items-center justify-center mx-auto text-[#8A9A86]">
                    <Package className="w-8 h-8" />
                  </div>
                  <h3 className="font-serif text-xl font-bold text-[#222922]">
                    No Orders Placed Yet
                  </h3>
                  <p className="text-xs text-[#6B776A] max-w-sm mx-auto">
                    You haven&apos;t placed any orders with BentoBabu yet. Explore our fresh daily menu!
                  </p>
                  <Link
                    href="/menu"
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-semibold"
                  >
                    Browse Fresh Menu
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => {
                    const isDelivered = order.status === "DELIVERED";
                    const isCancelled = order.status === "CANCELLED";
                    return (
                      <div
                        key={order.id}
                        className="bg-white rounded-3xl p-6 border border-[#E5DFC5] shadow-xs space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#F0ECE1]">
                          <div className="space-y-0.5">
                            <span className="font-mono text-xs font-bold text-[#354B35]">
                              Order #{order.orderNumber || order.id}
                            </span>
                            <div className="text-[11px] text-[#8A9A86]">
                              Placed on{" "}
                              {new Date(order.createdAt).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                                isCancelled
                                  ? "bg-red-50 text-red-700 border-red-200"
                                  : isDelivered
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : "bg-[#EBF0E9] text-[#354B35] border-[#8A9A86]/40"
                              }`}
                            >
                              {order.status.replace(/_/g, " ")}
                            </span>
                            <span className="font-serif font-bold text-lg text-[#354B35]">
                              ₹{order.total}
                            </span>
                          </div>
                        </div>

                        {/* Items */}
                        <div className="space-y-2">
                          {order.items.map((it, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center gap-2">
                                {it.productImage && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={it.productImage}
                                    alt={it.productName}
                                    className="w-8 h-8 rounded-lg object-cover border border-[#E5DFC5]"
                                  />
                                )}
                                <span className="text-[#222922] font-medium">
                                  {it.quantity}x {it.productName}
                                </span>
                              </div>
                              <span className="text-[#6B776A]">
                                ₹{it.price * it.quantity}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Bottom Actions */}
                        <div className="pt-3 border-t border-[#F0ECE1] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#6B776A]">
                          <div>
                            Destination:{" "}
                            <strong>
                              {order.deliveryAddress?.houseNo}, {order.deliveryAddress?.street}
                            </strong>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-auto">
                            <Link
                              href={`/orders/${order.id}`}
                              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#354B35] text-white font-semibold text-xs hover:bg-[#253525] transition-colors"
                            >
                              <Bike className="w-3.5 h-3.5 text-[#B99A60]" />
                              <span>Track Live</span>
                            </Link>

                            <Link
                              href={`/order-success/${order.id}`}
                              className="inline-flex items-center gap-1 text-[#354B35] font-semibold hover:underline"
                            >
                              <span>Receipt</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Saved Addresses */}
          {activeTab === "addresses" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-serif text-lg font-bold text-[#222922]">
                  Your Delivery Addresses
                </h3>
                {!showAddAddress && (
                  <button
                    onClick={() => setShowAddAddress(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add New Address</span>
                  </button>
                )}
              </div>

              {/* Add Address Form Box */}
              {showAddAddress && (
                <form
                  onSubmit={handleCreateAddress}
                  className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-[#354B35] space-y-4 shadow-sm"
                >
                  <div className="flex justify-between items-center pb-2 border-b border-[#F0ECE1]">
                    <h4 className="font-serif font-bold text-base text-[#222922]">
                      Add New Delivery Location
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowAddAddress(false)}
                      className="text-xs text-gray-500 hover:text-gray-800 underline cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>

                  {addressError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                      {addressError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <input
                      type="text"
                      required
                      placeholder="Recipient Full Name"
                      value={newAddr.fullName}
                      onChange={(e) =>
                        setNewAddr({ ...newAddr, fullName: e.target.value })
                      }
                      className="px-3.5 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-[#222922]"
                    />
                    <input
                      type="tel"
                      required
                      placeholder="10-digit Mobile Phone"
                      value={newAddr.phone}
                      onChange={(e) =>
                        setNewAddr({ ...newAddr, phone: e.target.value })
                      }
                      className="px-3.5 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-[#222922]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <input
                      type="text"
                      required
                      placeholder="Flat / Building / House No"
                      value={newAddr.houseNo}
                      onChange={(e) =>
                        setNewAddr({ ...newAddr, houseNo: e.target.value })
                      }
                      className="px-3.5 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-[#222922]"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Street / Area / Sector"
                      value={newAddr.street}
                      onChange={(e) =>
                        setNewAddr({ ...newAddr, street: e.target.value })
                      }
                      className="px-3.5 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-[#222922]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <input
                      type="text"
                      placeholder="Landmark (Optional)"
                      value={newAddr.landmark}
                      onChange={(e) =>
                        setNewAddr({ ...newAddr, landmark: e.target.value })
                      }
                      className="px-3.5 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-[#222922]"
                    />
                    <input
                      type="text"
                      required
                      placeholder="City"
                      value={newAddr.city}
                      onChange={(e) =>
                        setNewAddr({ ...newAddr, city: e.target.value })
                      }
                      className="px-3.5 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-[#222922]"
                    />
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="6-digit PIN Code"
                      value={newAddr.pincode}
                      onChange={(e) =>
                        setNewAddr({
                          ...newAddr,
                          pincode: e.target.value.replace(/\D/g, ""),
                        })
                      }
                      className="px-3.5 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-[#222922] font-mono font-bold"
                    />
                  </div>

                  <div className="flex items-center gap-4 text-xs pt-1">
                    <span className="font-semibold text-[#626F62]">Type:</span>
                    {(["HOME", "WORK", "OTHER"] as const).map((type) => (
                      <label key={type} className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="accountAddressType"
                          value={type}
                          checked={newAddr.addressType === type}
                          onChange={() => setNewAddr({ ...newAddr, addressType: type })}
                          className="text-[#354B35]"
                        />
                        <span>{type}</span>
                      </label>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={saveAddressMutation.isPending}
                      className="px-6 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    >
                      {saveAddressMutation.isPending && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      )}
                      <span>Save Address</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddAddress(false)}
                      className="px-5 py-2.5 rounded-full border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {addresses.map((addr) => (
                  <div
                    key={addr.id}
                    className="bg-white rounded-3xl p-6 border border-[#E5DFC5] shadow-xs space-y-3 relative"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#354B35] bg-[#EBF0E9] px-2.5 py-0.5 rounded-full">
                          {addr.type}
                        </span>
                        {addr.isDefault && (
                          <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                            Default
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => handleDeleteAddress(addr.id)}
                        className="text-[#8A9A86] hover:text-red-600 p-1 cursor-pointer transition-colors"
                        title="Delete address"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="text-xs text-[#222922] font-medium leading-relaxed">
                      <p className="font-bold text-sm text-[#222922]">
                        {addr.name} ({addr.phone})
                      </p>
                      <p className="mt-0.5">
                        {addr.houseNo}, {addr.street}
                      </p>
                      {addr.landmark && (
                        <p className="text-[#6B776A]">Near {addr.landmark}</p>
                      )}
                      <p className="text-[#6B776A]">
                        {addr.city}, {addr.state} -{" "}
                        <strong className="font-mono text-[#222922]">{addr.pincode}</strong>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 3: Profile Settings */}
          {activeTab === "profile" && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E5DFC5] shadow-xs max-w-xl space-y-6">
              <div className="border-b border-[#F0ECE1] pb-3">
                <h3 className="font-serif text-xl font-bold text-[#222922]">
                  Account Settings
                </h3>
                <p className="text-xs text-[#6B776A] mt-1">
                  Manage your personal contact info and delivery preferences.
                </p>
              </div>

              {profileSuccessMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{profileSuccessMsg}</span>
                </div>
              )}

              {profileErrorMsg && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                  {profileErrorMsg}
                </div>
              )}

              <form onSubmit={handleUpdateProfile} className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold text-[#222922] block">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#222922] focus:outline-none focus:border-[#354B35]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[#222922] block">
                    Email Address (Registered)
                  </label>
                  <input
                    type="email"
                    disabled
                    value={user.email}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-gray-100 border border-[#E5DFC5] text-xs text-gray-500 cursor-not-allowed"
                  />
                  <span className="text-[10px] text-[#8A9A86]">
                    Email cannot be changed directly for security purposes.
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[#222922] block">
                    Phone Number (for order OTP and updates)
                  </label>
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="10-digit mobile number"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#222922] focus:outline-none focus:border-[#354B35]"
                  />
                </div>

                <div className="pt-2 flex justify-between items-center">
                  <button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                    className="px-6 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    {updateProfileMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5 text-[#B99A60]" />
                    )}
                    <span>Save Profile Changes</span>
                  </button>

                  <Link
                    href="/notifications"
                    className="text-xs font-semibold text-[#354B35] hover:underline"
                  >
                    Manage Notification Channels →
                  </Link>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function AccountPage() {
  return <AccountContent />;
}
