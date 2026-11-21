"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  ShoppingBag,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Plus,
  Boxes,
  CalendarCheck2,
  Bell,
  RefreshCw,
  Compass,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { DateRangePreset } from "@/types";
import {
  useDashboardOverview,
  useDashboardRevenue,
  useDashboardOrders,
  useDashboardProducts,
  useDashboardCustomers,
  useDashboardLocations,
  useDashboardPayments,
  useDashboardDelivery,
  useDashboardPeakHours,
} from "@/hooks/useAdminQueries";

import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { BusinessOverviewKpis } from "@/components/dashboard/BusinessOverviewKpis";
import { RevenueAndOrdersSection } from "@/components/dashboard/RevenueAndOrdersSection";
import { ProductPerformanceSection } from "@/components/dashboard/ProductPerformanceSection";
import { CustomerInsightsSection } from "@/components/dashboard/CustomerInsightsSection";
import { OrderOperationsSection } from "@/components/dashboard/OrderOperationsSection";
import { GeographicDemandSection } from "@/components/dashboard/GeographicDemandSection";
import { ServiceExpansionSection } from "@/components/dashboard/ServiceExpansionSection";
import { PaymentAndDeliverySection } from "@/components/dashboard/PaymentAndDeliverySection";

export default function AdminDashboardPage() {
  const [period, setPeriod] = useState<DateRangePreset>("30d");
  const [customStart, setCustomStart] = useState<string | undefined>(undefined);
  const [customEnd, setCustomEnd] = useState<string | undefined>(undefined);

  const filterParams = {
    period,
    startDate: period === "custom" ? customStart : undefined,
    endDate: period === "custom" ? customEnd : undefined,
  };

  // Queries for all sections with shared date filter
  const {
    data: overview,
    isLoading: isOverviewLoading,
    refetch: refetchOverview,
  } = useDashboardOverview(filterParams);

  const {
    data: revenueData,
    isLoading: isRevenueLoading,
    refetch: refetchRevenue,
  } = useDashboardRevenue(filterParams);

  const {
    data: ordersData,
    isLoading: isOrdersLoading,
    refetch: refetchOrders,
  } = useDashboardOrders(filterParams);

  const {
    data: productsData,
    isLoading: isProductsLoading,
    refetch: refetchProducts,
  } = useDashboardProducts(filterParams);

  const {
    data: customersData,
    isLoading: isCustomersLoading,
    refetch: refetchCustomers,
  } = useDashboardCustomers(filterParams);

  const {
    data: locationsData,
    isLoading: isLocationsLoading,
    refetch: refetchLocations,
  } = useDashboardLocations(filterParams);

  const {
    data: paymentsData,
    isLoading: isPaymentsLoading,
    refetch: refetchPayments,
  } = useDashboardPayments(filterParams);

  const {
    data: deliveryData,
    isLoading: isDeliveryLoading,
    refetch: refetchDelivery,
  } = useDashboardDelivery(filterParams);

  const {
    data: peakHoursData,
    isLoading: isPeakHoursLoading,
    refetch: refetchPeakHours,
  } = useDashboardPeakHours(filterParams);

  const handleFilterChange = (params: {
    period: DateRangePreset;
    startDate?: string;
    endDate?: string;
  }) => {
    setPeriod(params.period);
    setCustomStart(params.startDate);
    setCustomEnd(params.endDate);
  };

  const handleRefreshAll = () => {
    refetchOverview();
    refetchRevenue();
    refetchOrders();
    refetchProducts();
    refetchCustomers();
    refetchLocations();
    refetchPayments();
    refetchDelivery();
    refetchPeakHours();
  };

  return (
    <AdminShell
      title="Business Intelligence & Operational Dashboard"
      subtitle="Authoritative real-time KPIs, financial reconciliation, menu performance, and geographic customer demand"
    >
      <div className="space-y-8 pb-12">
        {/* 1. Top Action & Filter Bar */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-3xl border border-[#E5DFC5] shadow-xs">
          {/* Quick Kitchen & Restock Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/products?action=new"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 text-[#B99A60]" />
              <span>Add Dish</span>
            </Link>

            <Link
              href="/orders?status=pending"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E5DFC5] bg-[#F7F3EA] text-[#354B35] text-xs font-semibold hover:bg-[#EDE8DE] transition-colors"
            >
              <Clock className="w-3.5 h-3.5 text-[#B99A60]" />
              <span>
                In Kitchen ({overview?.operations.pendingOrders ?? 0})
              </span>
            </Link>

            <Link
              href="/menu"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E5DFC5] bg-white text-[#1F271F] text-xs font-semibold hover:bg-[#EDE8DE] transition-colors"
            >
              <CalendarCheck2 className="w-3.5 h-3.5 text-[#354B35]" />
              <span>Daily Menu</span>
            </Link>

            <Link
              href="/inventory"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E5DFC5] bg-white text-[#1F271F] text-xs font-semibold hover:bg-[#EDE8DE] transition-colors"
            >
              <Boxes className="w-3.5 h-3.5 text-[#354B35]" />
              <span>Restock</span>
            </Link>

            <a
              href="#service-expansion-section"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E5DFC5] bg-[#F7F3EA] text-[#354B35] text-xs font-semibold hover:bg-[#EDE8DE] transition-colors"
            >
              <Compass className="w-3.5 h-3.5 text-[#B99A60]" />
              <span>Expansion Votes</span>
            </a>
          </div>

          {/* Date Filtering & Refresh Controls */}
          <div className="flex flex-wrap items-center gap-3 self-end xl:self-auto">
            <DateRangeFilter
              currentPreset={period}
              startDate={customStart}
              endDate={customEnd}
              onFilterChange={handleFilterChange}
            />

            <button
              type="button"
              onClick={handleRefreshAll}
              className="p-2 rounded-2xl border border-[#E5DFC5] bg-white hover:bg-[#F7F3EA] text-[#667266] hover:text-[#1F271F] transition-colors shadow-xs"
              title="Refresh dashboard metrics"
              aria-label="Refresh dashboard metrics"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Primary KPI Overview Cards */}
        <section aria-label="Business Overview KPIs">
          <BusinessOverviewKpis
            overview={overview}
            isLoading={isOverviewLoading}
          />
        </section>

        {/* 3. Revenue & Orders Trend + Financial Breakdown */}
        <section aria-label="Revenue and Orders Velocity">
          <RevenueAndOrdersSection
            revenueData={revenueData}
            ordersData={ordersData}
            isLoading={isRevenueLoading || isOrdersLoading}
          />
        </section>

        {/* 4. Product & Menu Analytics ("What's Selling the Most?") */}
        <section aria-label="Product Performance">
          <ProductPerformanceSection
            productsData={productsData}
            isLoading={isProductsLoading}
          />
        </section>

        {/* 5. Customer Insights ("Know Your Customers") */}
        <section aria-label="Customer Insights">
          <CustomerInsightsSection
            customersData={customersData}
            isLoading={isCustomersLoading}
          />
        </section>

        {/* 6. Order Operations & Peak Hourly Velocities */}
        <section aria-label="Order Operations">
          <OrderOperationsSection
            ordersData={ordersData}
            peakHoursData={peakHoursData}
            isLoading={isOrdersLoading || isPeakHoursLoading}
          />
        </section>

        {/* 7. Geographic Demand ("Where Are Our Customers Ordering From?") */}
        <section aria-label="Geographic Demand">
          <GeographicDemandSection
            locationsData={locationsData}
            isLoading={isLocationsLoading}
          />
        </section>

        {/* 8. Service Expansion Voting System ("Where Should BentoBabu Expand Next?") */}
        <section aria-label="Service Expansion Voting Analytics">
          <ServiceExpansionSection />
        </section>

        {/* 9. Payment Methods & Delivery Fleet Fulfillment */}
        <section aria-label="Payment and Delivery Operations">
          <PaymentAndDeliverySection
            paymentsData={paymentsData}
            deliveryData={deliveryData}
            isLoading={isPaymentsLoading || isDeliveryLoading}
          />
        </section>
      </div>
    </AdminShell>
  );
}
