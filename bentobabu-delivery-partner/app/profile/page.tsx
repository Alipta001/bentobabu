"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Phone,
  Mail,
  ShieldCheck,
  Bike,
  Power,
  LogOut,
  Edit2,
  Check,
  Save,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { clearCredentials, updateUser } from "@/store/slices/authSlice";
import { toggleOnlineStatus } from "@/store/slices/deliverySlice";
import { authApi } from "@/lib/api/auth.api";
import { profileApi } from "@/lib/api/profile.api";
import { toast } from "sonner";

export default function ProfilePage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const isOnline = useAppSelector((state) => state.delivery.isOnline);

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [isSaving, setIsSaving] = useState(false);

  const vehicle = profileApi.getVehicleDetails();
  const [vehicleNumber, setVehicleNumber] = useState(vehicle.vehicleNumber);
  const [licenseNumber, setLicenseNumber] = useState(vehicle.drivingLicenseNumber);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated = await profileApi.updateProfile({ name, phone });
      dispatch(updateUser(updated));

      profileApi.saveVehicleDetails({
        vehicleType: vehicle.vehicleType,
        model: vehicle.model,
        vehicleNumber,
        drivingLicenseNumber: licenseNumber,
      });

      toast.success("Profile and vehicle details saved successfully!");
      setIsEditing(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
      dispatch(clearCredentials());
      toast.success("Logged out successfully");
      router.push("/login");
    } catch {
      dispatch(clearCredentials());
      router.push("/login");
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="font-bold text-xl sm:text-2xl text-[#241C1A]">
            Delivery Partner Profile
          </h1>
          <p className="text-xs text-gray-500">
            Manage your personal profile, vehicle specifications, and status.
          </p>
        </div>

        {/* Hero Identity Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EFECE6] shadow-sm flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#C86D51] to-[#D9532F] text-white flex items-center justify-center font-bold text-3xl shadow-md shrink-0">
            {user?.name?.charAt(0).toUpperCase() || "R"}
          </div>

          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="font-bold text-xl text-[#241C1A]">
                {user?.name}
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified Rider
              </span>
            </div>

            <div className="text-xs font-mono text-gray-500">
              Agent ID: #{user?.id?.slice(-8).toUpperCase() || "AGT-00001"}
            </div>

            <p className="text-xs text-gray-600">
              Role: <span className="font-bold text-[#C86D51]">DELIVERY PARTNER</span> • Active Fleet Member
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="px-4 py-2 rounded-2xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>{isEditing ? "Cancel" : "Edit Profile"}</span>
          </button>
        </div>

        {/* Form or Readonly View */}
        <form onSubmit={handleSaveProfile} className="space-y-6">
          {/* Personal Details Section */}
          <div className="bg-white rounded-3xl p-6 border border-[#EFECE6] shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-[#241C1A] border-b border-gray-100 pb-2">
              Contact & Credentials
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 text-xs">
                <label className="font-bold text-gray-600">Full Name</label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 disabled:bg-[#FBF9F6] text-[#241C1A] font-semibold text-xs focus:outline-none focus:ring-2 focus:ring-[#C86D51]/20"
                />
              </div>

              <div className="space-y-1.5 text-xs">
                <label className="font-bold text-gray-600">Phone Number</label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 disabled:bg-[#FBF9F6] text-[#241C1A] font-semibold text-xs focus:outline-none focus:ring-2 focus:ring-[#C86D51]/20"
                />
              </div>

              <div className="space-y-1.5 text-xs sm:col-span-2">
                <label className="font-bold text-gray-600">Email Address (Registered)</label>
                <input
                  type="email"
                  disabled
                  value={user?.email || ""}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-[#FBF9F6] text-gray-500 font-semibold text-xs cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Vehicle Information Section */}
          <div className="bg-white rounded-3xl p-6 border border-[#EFECE6] shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="font-bold text-sm text-[#241C1A] flex items-center gap-2">
                <Bike className="w-4 h-4 text-[#C86D51]" />
                <span>Assigned Fleet Vehicle</span>
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase">
                {vehicle.verificationStatus}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-gray-600">Vehicle Type & Model</label>
                <input
                  type="text"
                  disabled
                  value={`${vehicle.vehicleType} (${vehicle.model})`}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-[#FBF9F6] text-gray-700 font-semibold text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-gray-600">Registration Number</label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 disabled:bg-[#FBF9F6] text-[#241C1A] font-semibold text-xs font-mono uppercase"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="font-bold text-gray-600">Driving License Number (DL)</label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 disabled:bg-[#FBF9F6] text-[#241C1A] font-semibold text-xs font-mono uppercase"
                />
              </div>
            </div>

            {isEditing && (
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-2xl bg-[#C86D51] text-white text-xs font-bold hover:bg-[#B35D42] shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? "Saving..." : "Save Changes"}</span>
                </button>
              </div>
            )}
          </div>
        </form>

        {/* Availability Toggle Box */}
        <div className="bg-white rounded-3xl p-6 border border-[#EFECE6] shadow-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="font-bold text-sm text-[#241C1A]">
              Delivery Duty Mode
            </div>
            <div className="text-xs text-gray-500">
              {isOnline
                ? "You are currently online and eligible for assignments."
                : "You are currently offline. No new orders will be assigned."}
            </div>
          </div>

          <button
            type="button"
            onClick={() => dispatch(toggleOnlineStatus())}
            className={`px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              isOnline
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{isOnline ? "Online" : "Offline"}</span>
          </button>
        </div>

        {/* Logout Section */}
        <div className="pt-4">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-600 font-bold text-xs hover:bg-red-100 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out of Delivery Portal</span>
          </button>
        </div>
      </div>
    </AppShell>
  );
}
