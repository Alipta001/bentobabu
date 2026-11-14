"use client";

import React, { useState } from "react";
import {
  UserPlus,
  ShieldCheck,
  Phone,
  Mail,
  ChefHat,
  Truck,
  X,
  Search,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  useAdminStaff,
  useCreateStaff,
} from "@/hooks/useAdminQueries";
import { userService } from "@/services/userService";
import { useQueryClient } from "@tanstack/react-query";

export default function StaffManagementPage() {
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "KITCHEN" as "KITCHEN" | "DELIVERY",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data: staffList = [], isLoading } = useAdminStaff(
    roleFilter === "all" ? undefined : roleFilter
  );
  const createStaffMutation = useCreateStaff();

  const filteredStaff = staffList.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.phone.includes(q)
    );
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createStaffMutation.mutateAsync({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password || "staffBento2026!",
        role: formData.role,
      });
      setModalOpen(false);
      setFormData({
        name: "",
        email: "",
        phone: "",
        password: "",
        role: "KITCHEN",
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create staff member.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      await userService.updateStatus(id, !currentStatus);
      queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update staff status.");
    }
  };

  return (
    <AdminShell
      title="Staff & Operations Personnel"
      subtitle="Manage kitchen personnel, dispatch handlers and delivery fleet accounts"
    >
      {/* Header action bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs">
        <div className="flex items-center gap-2 overflow-x-auto">
          {["all", "KITCHEN", "DELIVERY"].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                roleFilter === r
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE]"
              }`}
            >
              {r === "all" ? "All Operations Staff" : r === "KITCHEN" ? "Kitchen Chefs" : "Delivery Fleet"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A9A86]" />
            <input
              type="text"
              placeholder="Search staff..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35] w-48 sm:w-64"
            />
          </div>

          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors shadow-xs cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5 text-[#B99A60]" />
            <span>Add Staff</span>
          </button>
        </div>
      </div>

      {/* Staff Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full py-12 text-center text-xs text-[#8A9A86]">
            Loading operations personnel...
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="col-span-full py-12 text-center text-xs text-[#8A9A86] bg-white rounded-3xl border border-[#E5DFC5]">
            No operations staff members found matching criteria.
          </div>
        ) : (
          filteredStaff.map((staff) => (
            <div
              key={staff._id || staff.id}
              className="bg-white rounded-3xl p-6 border border-[#E5DFC5] shadow-xs flex flex-col justify-between space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-white shadow-xs ${
                      staff.role === "KITCHEN" ? "bg-amber-600" : "bg-emerald-700"
                    }`}
                  >
                    {staff.role === "KITCHEN" ? (
                      <ChefHat className="w-5 h-5" />
                    ) : (
                      <Truck className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-serif text-sm font-bold text-[#1E2B1E]">
                      {staff.name}
                    </h3>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mt-1 ${
                        staff.role === "KITCHEN"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {staff.role === "KITCHEN" ? "Kitchen Staff" : "Delivery Partner"}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleToggleStatus(staff._id || staff.id || "", staff.isActive)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors cursor-pointer ${
                    staff.isActive
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-rose-50 hover:text-rose-700"
                      : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-emerald-50 hover:text-emerald-700"
                  }`}
                >
                  {staff.isActive ? "Active" : "Deactivated"}
                </button>
              </div>

              <div className="space-y-1.5 text-xs text-[#667266] border-t border-[#F0ECE1] pt-3">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-[#8A9A86]" />
                  <span className="truncate">{staff.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-[#8A9A86]" />
                  <span>+91 {staff.phone}</span>
                </div>
              </div>

              <div className="pt-2 text-[10px] text-[#8A9A86] border-t border-[#F0ECE1] flex items-center justify-between">
                <span>Joined: {new Date(staff.createdAt).toLocaleDateString()}</span>
                <span className="flex items-center gap-1 font-semibold text-[#354B35]">
                  <ShieldCheck className="w-3 h-3 text-[#B99A60]" /> Operational Access
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Staff Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-[#E5DFC5] space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5DFC5]">
              <div className="flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-[#354B35]" />
                <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                  Create Staff Account
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-[#8A9A86] hover:text-[#1E2B1E] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                  Role & Department
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      role: e.target.value as "KITCHEN" | "DELIVERY",
                    })
                  }
                  className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                >
                  <option value="KITCHEN">KITCHEN — Kitchen Operations & Prep</option>
                  <option value="DELIVERY">DELIVERY — Dispatch & Fleet Partner</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="staff@bentobabu.in"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                  Mobile Number (10 Digits)
                </label>
                <input
                  type="tel"
                  required
                  placeholder="9876543210"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                  Initial Password (min 8 characters)
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5DFC5]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#E5DFC5] text-xs font-semibold text-[#667266] hover:bg-[#F7F3EA] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors cursor-pointer shadow-xs disabled:opacity-60"
                >
                  {loading ? "Creating..." : "Save Staff Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

