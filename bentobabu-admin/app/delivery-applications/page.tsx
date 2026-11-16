"use client";

import React, { useState, useEffect } from "react";
import {
  Bike,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Eye,
  ExternalLink,
  ShieldCheck,
  User,
  MapPin,
  FileText,
  FileCheck,
  RefreshCw,
  X,
  Phone,
  Mail,
  Calendar,
  ChevronRight,
  Filter,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  deliveryApplicationService,
  DeliveryApplication,
  DeliveryApplicationStats,
} from "@/services/deliveryApplicationService";

export default function DeliveryApplicationsPage() {
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<DeliveryApplication[]>([]);
  const [stats, setStats] = useState<DeliveryApplicationStats>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    correctionsRequested: 0,
    suspended: 0,
  });
  const [totalPages, setTotalPages] = useState(1);

  // Review Modal State
  const [activeApp, setActiveApp] = useState<DeliveryApplication | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Dialogs for Reject / Request Corrections / Approve
  const [dialogMode, setDialogMode] = useState<"APPROVE" | "REJECT" | "CORRECTIONS" | "SUSPEND" | null>(null);
  const [dialogInput, setDialogInput] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const res = await deliveryApplicationService.getAll({
        status: selectedStatus !== "ALL" ? selectedStatus : undefined,
        search: search.trim() || undefined,
        page,
        limit: 10,
      });

      setApplications(res.items);
      setTotalPages(res.totalPages);
      setStats(res.stats);
    } catch (err: any) {
      console.error("Failed to load applications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, [selectedStatus, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchApplications();
  };

  const handleOpenReview = (app: DeliveryApplication) => {
    setActiveApp(app);
    setDialogMode(null);
    setDialogInput("");
    setFeedbackMessage(null);
  };

  const handleCloseReview = () => {
    setActiveApp(null);
    setDialogMode(null);
    setDialogInput("");
    setFeedbackMessage(null);
  };

  const handleApprove = async () => {
    if (!activeApp) return;
    try {
      setActionLoading(true);
      const updated = await deliveryApplicationService.approve(activeApp._id, dialogInput);
      setActiveApp(updated);
      setDialogMode(null);
      setFeedbackMessage({ type: "success", text: "Application approved and partner account activated!" });
      fetchApplications();
    } catch (err: any) {
      setFeedbackMessage({
        type: "error",
        text: err?.response?.data?.message || err?.message || "Failed to approve application.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!activeApp) return;
    if (!dialogInput || dialogInput.trim().length < 5) {
      alert("Please provide a rejection reason of at least 5 characters.");
      return;
    }
    try {
      setActionLoading(true);
      const updated = await deliveryApplicationService.reject(activeApp._id, dialogInput.trim());
      setActiveApp(updated);
      setDialogMode(null);
      setFeedbackMessage({ type: "success", text: "Application rejected." });
      fetchApplications();
    } catch (err: any) {
      setFeedbackMessage({
        type: "error",
        text: err?.response?.data?.message || err?.message || "Failed to reject application.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestCorrections = async () => {
    if (!activeApp) return;
    if (!dialogInput || dialogInput.trim().length < 5) {
      alert("Please describe the requested corrections (minimum 5 characters).");
      return;
    }
    try {
      setActionLoading(true);
      const updated = await deliveryApplicationService.requestCorrections(activeApp._id, dialogInput.trim());
      setActiveApp(updated);
      setDialogMode(null);
      setFeedbackMessage({ type: "success", text: "Corrections requested from applicant." });
      fetchApplications();
    } catch (err: any) {
      setFeedbackMessage({
        type: "error",
        text: err?.response?.data?.message || err?.message || "Failed to request corrections.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!activeApp) return;
    try {
      setActionLoading(true);
      const updated = await deliveryApplicationService.suspend(activeApp._id, dialogInput.trim());
      setActiveApp(updated);
      setDialogMode(null);
      setFeedbackMessage({ type: "success", text: "Partner account suspended." });
      fetchApplications();
    } catch (err: any) {
      setFeedbackMessage({
        type: "error",
        text: err?.response?.data?.message || err?.message || "Failed to suspend account.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#2C3E2C] pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#354B35] text-[#B99A60] flex items-center justify-center border border-[#4A654A]">
                <Bike className="w-5 h-5" />
              </div>
              <h1 className="font-serif text-2xl font-bold tracking-tight text-white">
                Delivery Partner Applications
              </h1>
            </div>
            <p className="text-xs text-[#8A9A86] mt-1">
              Verify driving licenses, identity documents, and onboard delivery fleet personnel.
            </p>
          </div>
          <button
            onClick={() => fetchApplications()}
            className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-[#253525] border border-[#354B35] text-xs font-semibold text-[#EDE8DE] hover:bg-[#354B35] transition flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* KPI Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-[#1E2B1E] border border-[#2C3E2C] space-y-1">
            <span className="text-[11px] font-semibold text-[#8A9A86] uppercase tracking-wider">
              Total Applicants
            </span>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
          </div>

          <div className="p-4 rounded-2xl bg-[#1E2B1E] border border-[#2C3E2C] space-y-1 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                Pending Review
              </span>
              {stats.pending > 0 && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
              )}
            </div>
            <div className="text-2xl font-bold text-amber-300">{stats.pending}</div>
          </div>

          <div className="p-4 rounded-2xl bg-[#1E2B1E] border border-[#2C3E2C] space-y-1">
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
              Approved Partners
            </span>
            <div className="text-2xl font-bold text-emerald-300">{stats.approved}</div>
          </div>

          <div className="p-4 rounded-2xl bg-[#1E2B1E] border border-[#2C3E2C] space-y-1">
            <span className="text-[11px] font-semibold text-orange-400 uppercase tracking-wider">
              Corrections / Rejected
            </span>
            <div className="text-2xl font-bold text-orange-300">
              {stats.correctionsRequested + stats.rejected}
            </div>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="p-4 rounded-2xl bg-[#1E2B1E] border border-[#2C3E2C] flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 text-xs">
            {[
              { id: "ALL", label: "All" },
              { id: "PENDING_APPROVAL", label: `Pending (${stats.pending})` },
              { id: "APPROVED", label: `Approved (${stats.approved})` },
              { id: "CORRECTIONS_REQUESTED", label: `Corrections (${stats.correctionsRequested})` },
              { id: "REJECTED", label: `Rejected (${stats.rejected})` },
              { id: "SUSPENDED", label: `Suspended (${stats.suspended})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSelectedStatus(tab.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl font-semibold transition shrink-0 cursor-pointer ${
                  selectedStatus === tab.id
                    ? "bg-[#B99A60] text-[#1E2B1E]"
                    : "text-[#8A9A86] hover:text-white hover:bg-[#253525]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1 md:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A9A86]" />
              <input
                type="text"
                placeholder="Search name, phone, ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#162016] border border-[#2C3E2C] text-xs text-[#EDE8DE] placeholder:text-[#5A6D56] focus:outline-none focus:border-[#B99A60]"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-xl bg-[#354B35] hover:bg-[#4A654A] text-xs font-bold text-white transition cursor-pointer"
            >
              Search
            </button>
          </form>
        </div>

        {/* Applications List Table */}
        <div className="rounded-2xl bg-[#1E2B1E] border border-[#2C3E2C] overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs text-[#8A9A86] flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-[#B99A60]" />
              <span>Loading applications...</span>
            </div>
          ) : applications.length === 0 ? (
            <div className="p-12 text-center text-xs text-[#8A9A86] space-y-2">
              <Bike className="w-8 h-8 mx-auto text-[#4A654A]" />
              <p className="font-semibold text-white">No delivery partner applications found</p>
              <p className="text-[11px]">No submissions match the current status filter or search query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#EDE8DE]">
                <thead className="bg-[#162016] text-[#8A9A86] uppercase tracking-wider text-[10px] font-bold border-b border-[#2C3E2C]">
                  <tr>
                    <th className="py-3 px-4">Application ID</th>
                    <th className="py-3 px-4">Applicant</th>
                    <th className="py-3 px-4">Vehicle</th>
                    <th className="py-3 px-4">Date Applied</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2C3E2C]/50">
                  {applications.map((app) => (
                    <tr key={app._id} className="hover:bg-[#253525]/40 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-[#B99A60]">
                        {app.applicationNumber}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">
                          {app.personalInfo.fullName}
                        </div>
                        <div className="text-[11px] text-[#8A9A86] flex items-center gap-2 mt-0.5">
                          <span>+91 {app.personalInfo.phone}</span>
                          <span>•</span>
                          <span className="truncate max-w-[140px]">{app.personalInfo.email}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <Bike className="w-3.5 h-3.5 text-[#B99A60]" />
                          <span>{app.vehicleInfo.vehicleType.replace("_", " ")}</span>
                        </span>
                        {app.vehicleInfo.registrationNumber && (
                          <div className="text-[10px] text-[#8A9A86] font-mono mt-0.5">
                            {app.vehicleInfo.registrationNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-[#8A9A86]">
                        {new Date(app.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3.5 px-4">
                        {app.status === "APPROVED" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 font-bold text-[10px] border border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            APPROVED
                          </span>
                        )}
                        {(app.status === "PENDING_APPROVAL" ||
                          app.status === "PENDING_VERIFICATION") && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-950 text-amber-300 font-bold text-[10px] border border-amber-800">
                            <Clock className="w-3 h-3" />
                            PENDING REVIEW
                          </span>
                        )}
                        {app.status === "CORRECTIONS_REQUESTED" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-950 text-orange-300 font-bold text-[10px] border border-orange-800">
                            <AlertCircle className="w-3 h-3" />
                            CORRECTIONS REQ
                          </span>
                        )}
                        {app.status === "REJECTED" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-950 text-red-300 font-bold text-[10px] border border-red-800">
                            <XCircle className="w-3 h-3" />
                            REJECTED
                          </span>
                        )}
                        {app.status === "SUSPENDED" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-900 text-gray-300 font-bold text-[10px] border border-gray-700">
                            <AlertCircle className="w-3 h-3" />
                            SUSPENDED
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenReview(app)}
                          className="px-3 py-1.5 rounded-xl bg-[#354B35] hover:bg-[#4A654A] text-[#EDE8DE] font-semibold text-xs transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#B99A60]" />
                          <span>Review</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-[#2C3E2C] flex items-center justify-between text-xs text-[#8A9A86]">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 rounded-lg bg-[#253525] hover:bg-[#354B35] disabled:opacity-40 text-white cursor-pointer"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 rounded-lg bg-[#253525] hover:bg-[#354B35] disabled:opacity-40 text-white cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* REVIEW MODAL / DRAWER */}
        {activeApp && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
            <div className="bg-[#1E2B1E] border border-[#2C3E2C] rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              {/* Modal Top Header */}
              <div className="p-5 border-b border-[#2C3E2C] flex items-center justify-between bg-[#162016]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#354B35] text-[#B99A60] flex items-center justify-center">
                    <Bike className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white leading-none">
                      Application #{activeApp.applicationNumber}
                    </h2>
                    <span className="text-[11px] text-[#8A9A86] mt-0.5 block">
                      Submitted on {new Date(activeApp.createdAt).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseReview}
                  className="p-1.5 rounded-lg text-[#8A9A86] hover:text-white hover:bg-[#253525] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 text-xs text-[#EDE8DE]">
                {/* Feedback banner */}
                {feedbackMessage && (
                  <div
                    className={`p-3 rounded-xl border flex items-center gap-2 font-semibold ${
                      feedbackMessage.type === "success"
                        ? "bg-emerald-950/80 border-emerald-700 text-emerald-300"
                        : "bg-red-950/80 border-red-700 text-red-300"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{feedbackMessage.text}</span>
                  </div>
                )}

                {/* Section 1: Candidate & Address */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Candidate Info */}
                  <div className="p-4 rounded-2xl bg-[#162016] border border-[#2C3E2C] space-y-2">
                    <span className="text-[10px] font-bold text-[#B99A60] uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      Candidate Details
                    </span>
                    <div className="space-y-1">
                      <div className="font-bold text-sm text-white">
                        {activeApp.personalInfo.fullName}
                      </div>
                      <div className="text-[#8A9A86] flex items-center gap-1.5">
                        <Phone className="w-3 h-3" />
                        <span>+91 {activeApp.personalInfo.phone}</span>
                      </div>
                      <div className="text-[#8A9A86] flex items-center gap-1.5">
                        <Mail className="w-3 h-3" />
                        <span>{activeApp.personalInfo.email}</span>
                      </div>
                      <div className="text-[#8A9A86] pt-1">
                        DOB: {new Date(activeApp.personalInfo.dateOfBirth).toLocaleDateString("en-IN")} • Gender: {activeApp.personalInfo.gender}
                      </div>
                    </div>
                  </div>

                  {/* Residential Address */}
                  <div className="p-4 rounded-2xl bg-[#162016] border border-[#2C3E2C] space-y-2">
                    <span className="text-[10px] font-bold text-[#B99A60] uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      Residential Address
                    </span>
                    <div className="text-[#EDE8DE] leading-relaxed">
                      <div>{activeApp.address.houseNo}, {activeApp.address.street}</div>
                      {activeApp.address.landmark && (
                        <div className="text-[11px] text-[#8A9A86]">
                          Landmark: {activeApp.address.landmark}
                        </div>
                      )}
                      <div>
                        {activeApp.address.city}, {activeApp.address.state} — <strong>{activeApp.address.pincode}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Vehicle Information */}
                <div className="p-4 rounded-2xl bg-[#162016] border border-[#2C3E2C] space-y-2">
                  <span className="text-[10px] font-bold text-[#B99A60] uppercase tracking-wider flex items-center gap-1.5">
                    <Bike className="w-3.5 h-3.5" />
                    Vehicle & License Details
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    <div>
                      <span className="text-[#8A9A86] block text-[10px] uppercase font-bold">Vehicle Type</span>
                      <strong className="text-white">{activeApp.vehicleInfo.vehicleType.replace('_', ' ')}</strong>
                    </div>
                    <div>
                      <span className="text-[#8A9A86] block text-[10px] uppercase font-bold">Vehicle Brand / Model</span>
                      <strong className="text-white">
                        {activeApp.vehicleInfo.brand || "—"} {activeApp.vehicleInfo.model || ""}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#8A9A86] block text-[10px] uppercase font-bold">Registration Number</span>
                      <strong className="text-white font-mono">{activeApp.vehicleInfo.registrationNumber || "N/A (Bicycle)"}</strong>
                    </div>
                    <div>
                      <span className="text-[#8A9A86] block text-[10px] uppercase font-bold">Driving License Number</span>
                      <strong className="text-white font-mono">{activeApp.vehicleInfo.drivingLicenseNumber || "N/A (Bicycle)"}</strong>
                    </div>
                  </div>
                </div>

                {/* Section 3: Document Verification Gallery */}
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-[#B99A60] uppercase tracking-wider flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5" />
                    Uploaded Verification Documents
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {/* 1. Profile Photo */}
                    <div className="p-3 rounded-xl bg-[#162016] border border-[#2C3E2C] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px] text-white">Profile Photo</span>
                        <span className="text-[10px] text-emerald-400 font-semibold">Verified</span>
                      </div>
                      {activeApp.documents.profilePhoto?.secureUrl ? (
                        <div className="space-y-2">
                          <img
                            src={activeApp.documents.profilePhoto.secureUrl}
                            alt="Profile"
                            className="w-full h-32 object-cover rounded-lg border border-[#2C3E2C]"
                          />
                          <a
                            href={activeApp.documents.profilePhoto.secureUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-[#B99A60] hover:underline flex items-center gap-1"
                          >
                            <span>Open Full Image</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ) : (
                        <div className="text-[11px] text-[#8A9A86]">No photo uploaded</div>
                      )}
                    </div>

                    {/* 2. ID Proof */}
                    <div className="p-3 rounded-xl bg-[#162016] border border-[#2C3E2C] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px] text-white">
                          ID Proof ({activeApp.documents.idProof?.idType || "Govt ID"})
                        </span>
                        <span className="text-[10px] text-emerald-400 font-semibold">Uploaded</span>
                      </div>
                      {activeApp.documents.idProof?.document?.secureUrl ? (
                        <div className="space-y-2">
                          {activeApp.documents.idProof.document.mimeType?.includes("image") ? (
                            <img
                              src={activeApp.documents.idProof.document.secureUrl}
                              alt="ID Proof"
                              className="w-full h-32 object-cover rounded-lg border border-[#2C3E2C]"
                            />
                          ) : (
                            <div className="w-full h-32 rounded-lg bg-[#253525] border border-[#354B35] flex flex-col items-center justify-center text-center p-2 text-[#8A9A86]">
                              <FileText className="w-8 h-8 text-[#B99A60] mb-1" />
                              <span className="text-[10px] truncate max-w-full">
                                {activeApp.documents.idProof.document.fileName || "Document PDF"}
                              </span>
                            </div>
                          )}
                          <a
                            href={activeApp.documents.idProof.document.secureUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-[#B99A60] hover:underline flex items-center gap-1"
                          >
                            <span>Inspect ID Proof</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ) : (
                        <div className="text-[11px] text-[#8A9A86]">No ID proof uploaded</div>
                      )}
                    </div>

                    {/* 3. Driving License */}
                    <div className="p-3 rounded-xl bg-[#162016] border border-[#2C3E2C] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px] text-white">Driving License</span>
                        <span className="text-[10px] text-emerald-400 font-semibold">
                          {activeApp.documents.drivingLicense?.secureUrl ? "Uploaded" : "Optional"}
                        </span>
                      </div>
                      {activeApp.documents.drivingLicense?.secureUrl ? (
                        <div className="space-y-2">
                          {activeApp.documents.drivingLicense.mimeType?.includes("image") ? (
                            <img
                              src={activeApp.documents.drivingLicense.secureUrl}
                              alt="Driving License"
                              className="w-full h-32 object-cover rounded-lg border border-[#2C3E2C]"
                            />
                          ) : (
                            <div className="w-full h-32 rounded-lg bg-[#253525] border border-[#354B35] flex flex-col items-center justify-center text-center p-2 text-[#8A9A86]">
                              <FileText className="w-8 h-8 text-[#B99A60] mb-1" />
                              <span className="text-[10px] truncate max-w-full">
                                {activeApp.documents.drivingLicense.fileName || "DL Document"}
                              </span>
                            </div>
                          )}
                          <a
                            href={activeApp.documents.drivingLicense.secureUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-[#B99A60] hover:underline flex items-center gap-1"
                          >
                            <span>Inspect DL Document</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ) : (
                        <div className="text-[11px] text-[#8A9A86] py-10 text-center">
                          Not applicable for bicycle
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Section 4: Audit & Review Notes */}
                {(activeApp.rejectionReason || activeApp.requestedCorrections) && (
                  <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-800 text-amber-200 space-y-1">
                    <span className="font-bold block text-xs">Review Notes / Feedback:</span>
                    <p className="italic text-xs">
                      "{activeApp.rejectionReason || activeApp.requestedCorrections}"
                    </p>
                  </div>
                )}

                {/* Action Input Prompt Dialog */}
                {dialogMode && (
                  <div className="p-4 rounded-2xl bg-[#162016] border border-[#B99A60]/50 space-y-3 animate-in fade-in duration-100">
                    <div className="font-bold text-white text-xs">
                      {dialogMode === "APPROVE" && "Confirm Partner Onboarding Approval"}
                      {dialogMode === "REJECT" && "Mandatory Rejection Reason"}
                      {dialogMode === "CORRECTIONS" && "Specify Required Corrections"}
                      {dialogMode === "SUSPEND" && "Suspend Partner Account"}
                    </div>

                    <textarea
                      rows={3}
                      value={dialogInput}
                      onChange={(e) => setDialogInput(e.target.value)}
                      placeholder={
                        dialogMode === "APPROVE"
                          ? "Optional internal approval note..."
                          : dialogMode === "REJECT"
                          ? "Explain why the application is rejected (sent to applicant)..."
                          : dialogMode === "CORRECTIONS"
                          ? "Specify which document or field needs correction (sent to applicant)..."
                          : "Reason for suspension..."
                      }
                      className="w-full p-3 rounded-xl bg-[#1E2B1E] border border-[#2C3E2C] text-xs text-white placeholder:text-[#5A6D56] focus:outline-none focus:border-[#B99A60]"
                    />

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setDialogMode(null)}
                        className="px-3 py-1.5 rounded-xl border border-[#2C3E2C] text-xs text-[#8A9A86] hover:text-white"
                      >
                        Cancel
                      </button>

                      {dialogMode === "APPROVE" && (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={handleApprove}
                          className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white"
                        >
                          {actionLoading ? "Approving..." : "Confirm & Activate Partner"}
                        </button>
                      )}

                      {dialogMode === "REJECT" && (
                        <button
                          type="button"
                          disabled={actionLoading || dialogInput.trim().length < 5}
                          onClick={handleReject}
                          className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-xs font-bold text-white"
                        >
                          {actionLoading ? "Rejecting..." : "Submit Rejection"}
                        </button>
                      )}

                      {dialogMode === "CORRECTIONS" && (
                        <button
                          type="button"
                          disabled={actionLoading || dialogInput.trim().length < 5}
                          onClick={handleRequestCorrections}
                          className="px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-xs font-bold text-white"
                        >
                          {actionLoading ? "Submitting..." : "Send Request"}
                        </button>
                      )}

                      {dialogMode === "SUSPEND" && (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={handleSuspend}
                          className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white"
                        >
                          {actionLoading ? "Suspending..." : "Suspend Partner"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer Controls */}
              <div className="p-4 border-t border-[#2C3E2C] bg-[#162016] flex flex-wrap items-center justify-between gap-3">
                <div className="text-[11px] text-[#8A9A86]">
                  Current Status: <strong className="text-white uppercase">{activeApp.status}</strong>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeApp.status !== "APPROVED" && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setDialogMode("APPROVE");
                          setDialogInput("");
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve Partner</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDialogMode("CORRECTIONS");
                          setDialogInput("");
                        }}
                        className="px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-xs font-bold text-white transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Request Corrections</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDialogMode("REJECT");
                          setDialogInput("");
                        }}
                        className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </>
                  )}

                  {activeApp.status === "APPROVED" && (
                    <button
                      type="button"
                      onClick={() => {
                        setDialogMode("SUSPEND");
                        setDialogInput("");
                      }}
                      className="px-3.5 py-2 rounded-xl bg-red-900 hover:bg-red-800 text-xs font-bold text-red-200 transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Suspend Account</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
