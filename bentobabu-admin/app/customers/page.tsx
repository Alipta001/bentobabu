"use client";

import React, { useState } from "react";
import { Search } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  useAdminCustomers,
  useToggleBlockCustomer,
} from "@/hooks/useAdminQueries";

export default function AdminCustomersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: customers = [], isLoading } = useAdminCustomers(searchQuery);
  const toggleBlockMutation = useToggleBlockCustomer();

  const handleToggleBlock = async (id: string, name: string, isBlocked?: boolean) => {
    const action = isBlocked ? "unblock" : "block";
    if (confirm(`Are you sure you want to ${action} customer "${name}"?`)) {
      await toggleBlockMutation.mutateAsync({ id, isBlocked });
    }
  };

  return (
    <AdminShell
      title="Customer Relationship Management"
      subtitle="View customer order frequency, total spending volume and manage account access"
    >
      <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search customers by name, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-full bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#1F271F] focus:outline-none focus:border-[#354B35]"
          />
          <Search className="w-4 h-4 text-[#8A9A86] absolute left-3.5 top-3 pointer-events-none" />
        </div>

        <div className="text-xs text-[#667266] font-medium">
          Total Registered Members: <strong>{customers.length}</strong>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-[#667266]">
            Loading customer accounts...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#F7F3EA] border-b border-[#E5DFC5] text-[11px] uppercase tracking-wider text-[#667266]">
                  <th className="py-3.5 px-6 font-bold">Customer Name</th>
                  <th className="py-3.5 px-4 font-bold">Contact Info</th>
                  <th className="py-3.5 px-4 font-bold">Joined Date</th>
                  <th className="py-3.5 px-4 font-bold">Total Orders</th>
                  <th className="py-3.5 px-4 font-bold">Total Spend</th>
                  <th className="py-3.5 px-4 font-bold">Status</th>
                  <th className="py-3.5 px-6 font-bold text-right">Access Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0ECE1]">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F9F7F1] transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="font-bold text-[#1F271F]">{c.name}</div>
                      <div className="text-[10px] text-[#8A9A86] font-mono">ID: {c.id}</div>
                    </td>

                    <td className="py-3.5 px-4 text-[#667266]">
                      <div>{c.email}</div>
                      <div className="text-[11px]">{c.phone}</div>
                    </td>

                    <td className="py-3.5 px-4 text-[#667266]">
                      {new Date(c.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>

                    <td className="py-3.5 px-4 font-semibold text-[#1F271F]">
                      {c.totalOrders} orders
                    </td>

                    <td className="py-3.5 px-4 font-bold text-[#354B35]">
                      ₹{c.totalSpent.toLocaleString("en-IN")}
                    </td>

                    <td className="py-3.5 px-4">
                      {c.isBlocked ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                          Blocked
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Active Member
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-6 text-right">
                      <button
                        onClick={() => handleToggleBlock(c.id, c.name, c.isBlocked)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer transition-colors ${
                          c.isBlocked
                            ? "bg-emerald-700 text-white hover:bg-emerald-800"
                            : "border border-red-300 text-red-700 hover:bg-red-50"
                        }`}
                      >
                        {c.isBlocked ? "Unblock Account" : "Block"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
