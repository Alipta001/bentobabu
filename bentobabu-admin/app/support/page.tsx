"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Headphones,
  Search,
  Filter,
  RefreshCw,
  Plus,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Lock,
  Send,
  Eye,
  X,
  FileText,
  User,
  ShoppingBag,
  ExternalLink,
  ChevronRight,
  Edit2,
  Trash2,
  Tag,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { adminSupportService } from "@/services/supportService";
import {
  AdminTicketListItem,
  AdminTicketDetail,
  SupportStats,
  AdminFaqItem,
  TicketStatus,
  TicketCategory,
  TicketPriority,
} from "@/types";

const CATEGORY_LABELS: Record<string, string> = {
  ORDER_ISSUE: "Order Issue",
  ORDERING: "Ordering & Menu",
  PAYMENT_ISSUE: "Payment Issue",
  PAYMENTS: "Payments & COD",
  DELIVERY_ISSUE: "Delivery Issue",
  DELIVERY: "Delivery & Timing",
  CANCELLATIONS: "Cancellations",
  MISSING_INCORRECT_ITEM: "Missing / Incorrect Item",
  FOOD_QUALITY: "Food Quality Concern",
  FOOD_AND_INGREDIENTS: "Food & Ingredients",
  REFUND_REQUEST: "Refund Request",
  REFUNDS: "Refunds",
  ACCOUNT_ISSUE: "Account Issue",
  ACCOUNT_MANAGEMENT: "Account & Settings",
  OTHER: "General / Other",
  GENERAL: "General Support",
};

const STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  OPEN: {
    label: "Open",
    bg: "bg-amber-500/10",
    text: "text-amber-700",
    border: "border-amber-500/30",
  },
  IN_PROGRESS: {
    label: "In Progress",
    bg: "bg-blue-500/10",
    text: "text-blue-700",
    border: "border-blue-500/30",
  },
  WAITING_FOR_CUSTOMER: {
    label: "Awaiting Customer",
    bg: "bg-purple-500/10",
    text: "text-purple-700",
    border: "border-purple-500/30",
  },
  RESOLVED: {
    label: "Resolved",
    bg: "bg-emerald-500/10",
    text: "text-emerald-700",
    border: "border-emerald-500/30",
  },
  CLOSED: {
    label: "Closed",
    bg: "bg-neutral-500/10",
    text: "text-neutral-600",
    border: "border-neutral-500/30",
  },
};

const PRIORITY_BADGES: Record<TicketPriority, { label: string; color: string }> = {
  LOW: { label: "Low", color: "bg-slate-100 text-slate-700" },
  MEDIUM: { label: "Medium", color: "bg-blue-100 text-blue-800" },
  HIGH: { label: "High", color: "bg-orange-100 text-orange-800" },
  URGENT: { label: "Urgent", color: "bg-red-100 text-red-800 font-bold" },
};

export default function AdminSupportPage() {
  const [activeTab, setActiveTab] = useState<"tickets" | "faqs">("tickets");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<SupportStats | null>(null);

  // Tickets state
  const [tickets, setTickets] = useState<AdminTicketListItem[]>([]);
  const [totalTickets, setTotalTickets] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");

  // Selected Ticket Drawer / Modal
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<AdminTicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Reply / Note form state
  const [replyMessage, setReplyMessage] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  // Status update state
  const [newStatus, setNewStatus] = useState<TicketStatus>("OPEN");
  const [resolutionNote, setResolutionNote] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // FAQ state
  const [faqs, setFaqs] = useState<AdminFaqItem[]>([]);
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<AdminFaqItem | null>(null);
  const [faqForm, setFaqForm] = useState({
    question: "",
    answer: "",
    category: "GENERAL",
    isPublished: true,
    orderIndex: 0,
  });
  const [savingFaq, setSavingFaq] = useState(false);

  // Load stats
  const fetchStats = useCallback(async () => {
    try {
      const data = await adminSupportService.getStats();
      setStats(data);
    } catch {
      // stats error fallback
    }
  }, []);

  // Load tickets
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminSupportService.getTickets({
        status: statusFilter,
        category: categoryFilter,
        priority: priorityFilter,
        search: search.trim() || undefined,
        page,
        limit: 15,
      });
      setTickets(res.tickets);
      setTotalTickets(res.total);
      setTotalPages(res.totalPages);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load support tickets");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, priorityFilter, search, page]);

  // Load FAQs
  const fetchFaqs = useCallback(async () => {
    try {
      const data = await adminSupportService.getFaqs();
      setFaqs(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load FAQs");
    }
  }, []);

  useEffect(() => {
    fetchStats();
    if (activeTab === "tickets") {
      fetchTickets();
    } else {
      fetchFaqs();
    }
  }, [fetchStats, fetchTickets, fetchFaqs, activeTab]);

  // Load ticket details when drawer opens
  const openTicketDetail = async (id: string) => {
    setSelectedTicketId(id);
    setDetailLoading(true);
    try {
      const data = await adminSupportService.getTicketById(id);
      setTicketDetail(data);
      setNewStatus(data.status);
      setResolutionNote(data.resolutionNote || "");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load ticket details");
      setSelectedTicketId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeTicketDetail = () => {
    setSelectedTicketId(null);
    setTicketDetail(null);
    setReplyMessage("");
    setIsInternalNote(false);
  };

  // Submit reply or internal note
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketDetail || !replyMessage.trim()) return;

    setSendingReply(true);
    try {
      await adminSupportService.addMessage(ticketDetail.id, {
        message: replyMessage.trim(),
        isInternalNote,
      });

      toast.success(
        isInternalNote ? "Internal team note added" : "Reply sent to customer"
      );
      setReplyMessage("");
      // Refresh ticket detail & list
      const updated = await adminSupportService.getTicketById(ticketDetail.id);
      setTicketDetail(updated);
      setNewStatus(updated.status);
      fetchTickets();
      fetchStats();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSendingReply(false);
    }
  };

  // Update status
  const handleUpdateStatus = async () => {
    if (!ticketDetail) return;
    setUpdatingStatus(true);
    try {
      await adminSupportService.updateStatus(ticketDetail.id, {
        status: newStatus,
        resolutionNote: resolutionNote.trim() || undefined,
      });
      toast.success(`Ticket status updated to ${newStatus}`);
      const updated = await adminSupportService.getTicketById(ticketDetail.id);
      setTicketDetail(updated);
      fetchTickets();
      fetchStats();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update ticket status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  // FAQ CRUD handlers
  const openCreateFaq = () => {
    setEditingFaq(null);
    setFaqForm({
      question: "",
      answer: "",
      category: "GENERAL",
      isPublished: true,
      orderIndex: (faqs.length + 1) * 10,
    });
    setFaqModalOpen(true);
  };

  const openEditFaq = (faq: AdminFaqItem) => {
    setEditingFaq(faq);
    setFaqForm({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      isPublished: faq.isPublished,
      orderIndex: faq.orderIndex,
    });
    setFaqModalOpen(true);
  };

  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingFaq(true);
    try {
      if (editingFaq) {
        await adminSupportService.updateFaq(editingFaq.id, faqForm);
        toast.success("FAQ updated successfully");
      } else {
        await adminSupportService.createFaq(faqForm);
        toast.success("FAQ created successfully");
      }
      setFaqModalOpen(false);
      fetchFaqs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save FAQ");
    } finally {
      setSavingFaq(false);
    }
  };

  const handleDeleteFaq = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this FAQ item?")) return;
    try {
      await adminSupportService.deleteFaq(id);
      toast.success("FAQ deleted");
      fetchFaqs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete FAQ");
    }
  };

  const handleToggleFaqPublish = async (faq: AdminFaqItem) => {
    try {
      await adminSupportService.updateFaq(faq.id, { isPublished: !faq.isPublished });
      toast.success(`FAQ ${!faq.isPublished ? "published" : "hidden"}`);
      fetchFaqs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle status");
    }
  };

  return (
    <AdminShell
      title="Customer Support & Helpdesk"
      subtitle="Manage support tickets, converse with customers, keep private team notes, and publish FAQs."
    >
      {/* Tab Switcher & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E5DFC5] pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("tickets")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
              activeTab === "tickets"
                ? "bg-[#354B35] text-white shadow-xs"
                : "bg-white text-[#667266] border border-[#E5DFC5] hover:bg-[#F7F3EA]"
            }`}
          >
            <Headphones className="w-4 h-4" />
            <span>Support Tickets</span>
            {stats && stats.open + stats.inProgress > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#B99A60] text-[#1E2B1E]">
                {stats.open + stats.inProgress} active
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("faqs")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
              activeTab === "faqs"
                ? "bg-[#354B35] text-white shadow-xs"
                : "bg-white text-[#667266] border border-[#E5DFC5] hover:bg-[#F7F3EA]"
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>FAQ Management</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E8E2D2] text-[#354B35]">
              {faqs.length}
            </span>
          </button>
        </div>

        {activeTab === "faqs" && (
          <button
            type="button"
            onClick={openCreateFaq}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#354B35] text-[#F7F3EA] text-xs font-bold hover:bg-[#253525] transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New FAQ</span>
          </button>
        )}
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-2xl bg-white border border-[#E5DFC5] shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#667266]">
              Total Tickets
            </div>
            <div className="text-2xl font-black text-[#222922] mt-1">{stats.total}</div>
          </div>
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              Open Tickets
            </div>
            <div className="text-2xl font-black text-amber-900 mt-1">{stats.open}</div>
          </div>
          <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
              In Progress
            </div>
            <div className="text-2xl font-black text-blue-900 mt-1">{stats.inProgress}</div>
          </div>
          <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-purple-800">
              Awaiting Customer
            </div>
            <div className="text-2xl font-black text-purple-900 mt-1">
              {stats.waitingForCustomer}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              Resolved
            </div>
            <div className="text-2xl font-black text-emerald-900 mt-1">{stats.resolved}</div>
          </div>
          <div className="p-3.5 rounded-2xl bg-neutral-100 border border-neutral-200 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">
              Closed
            </div>
            <div className="text-2xl font-black text-neutral-800 mt-1">{stats.closed}</div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TICKETS TAB */}
      {/* ========================================================================= */}
      {activeTab === "tickets" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="p-4 bg-white rounded-2xl border border-[#E5DFC5] shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#8A9A86] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search ticket #, subject, customer name or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchTickets()}
                className="w-full pl-9 pr-4 py-2 bg-[#F7F3EA] border border-[#E8E2D2] rounded-xl text-xs text-[#222922] placeholder:text-[#8A9A86] focus:outline-hidden focus:border-[#354B35]"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-[#F7F3EA] border border-[#E8E2D2] rounded-xl text-xs font-semibold text-[#222922] cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="WAITING_FOR_CUSTOMER">Awaiting Customer</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-[#F7F3EA] border border-[#E8E2D2] rounded-xl text-xs font-semibold text-[#222922] cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              <option value="ORDER_ISSUE">Order Issue</option>
              <option value="PAYMENT_ISSUE">Payment Issue</option>
              <option value="DELIVERY_ISSUE">Delivery Issue</option>
              <option value="MISSING_INCORRECT_ITEM">Missing/Incorrect Item</option>
              <option value="FOOD_QUALITY">Food Quality</option>
              <option value="REFUND_REQUEST">Refund Request</option>
              <option value="ACCOUNT_ISSUE">Account Issue</option>
              <option value="OTHER">Other</option>
            </select>

            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-[#F7F3EA] border border-[#E8E2D2] rounded-xl text-xs font-semibold text-[#222922] cursor-pointer"
            >
              <option value="ALL">All Priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={fetchTickets}
              disabled={loading}
              className="p-2 rounded-xl border border-[#E5DFC5] bg-white text-[#354B35] hover:bg-[#F7F3EA] transition-colors cursor-pointer shrink-0"
              title="Refresh Tickets"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Tickets Table */}
          <div className="bg-white rounded-2xl border border-[#E5DFC5] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F7F3EA] border-b border-[#E5DFC5] text-[11px] font-bold text-[#667266] uppercase tracking-wider">
                    <th className="py-3 px-4">Ticket</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Category & Priority</th>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Linked Order</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Messages</th>
                    <th className="py-3 px-4">Updated</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E2D2]">
                  {loading && tickets.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-[#8A9A86]">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#354B35]" />
                        <span>Loading support tickets...</span>
                      </td>
                    </tr>
                  ) : tickets.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-[#667266]">
                        <MessageSquare className="w-8 h-8 mx-auto mb-2 text-[#8A9A86] opacity-60" />
                        <div className="font-bold text-sm text-[#222922]">No support tickets found</div>
                        <p className="text-xs text-[#8A9A86] mt-0.5">
                          Tickets matching your filter criteria will appear here.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    tickets.map((t) => {
                      const statusConf = STATUS_CONFIG[t.status] || STATUS_CONFIG.OPEN;
                      const priorityConf = PRIORITY_BADGES[t.priority] || PRIORITY_BADGES.MEDIUM;

                      return (
                        <tr
                          key={t.id}
                          className="hover:bg-[#FDFBF7] transition-colors cursor-pointer"
                          onClick={() => openTicketDetail(t.id)}
                        >
                          <td className="py-3.5 px-4 font-mono font-bold text-[#354B35]">
                            {t.ticketNumber}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-[#222922]">
                              {t.customer?.name || "Anonymous Customer"}
                            </div>
                            <div className="text-[11px] text-[#8A9A86] truncate max-w-[140px]">
                              {t.customer?.email}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-medium text-[#222922]">
                              {CATEGORY_LABELS[t.category] || t.category}
                            </div>
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mt-0.5 ${priorityConf.color}`}
                            >
                              {priorityConf.label}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 max-w-[200px]">
                            <div className="font-medium text-[#222922] truncate" title={t.subject}>
                              {t.subject}
                            </div>
                            <div className="text-[11px] text-[#8A9A86] truncate mt-0.5">
                              {t.lastMessageSnippet}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            {t.order ? (
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[#354B35] bg-[#EBF0E9] px-2 py-0.5 rounded-md">
                                <ShoppingBag className="w-3 h-3 text-[#B99A60]" />
                                <span>{t.order.orderNumber}</span>
                              </span>
                            ) : (
                              <span className="text-[#8A9A86] text-[11px] italic">None</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusConf.bg} ${statusConf.text} ${statusConf.border}`}
                            >
                              {statusConf.label}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 font-semibold text-[#222922]">
                              <MessageSquare className="w-3.5 h-3.5 text-[#8A9A86]" />
                              <span>{t.messageCount}</span>
                              {t.internalNotesCount > 0 && (
                                <span
                                  className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded"
                                  title={`${t.internalNotesCount} internal notes`}
                                >
                                  <Lock className="w-2.5 h-2.5" />
                                  <span>{t.internalNotesCount}</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-[#8A9A86] text-[11px] whitespace-nowrap">
                            {new Date(t.lastMessageAt).toLocaleDateString("en-IN", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openTicketDetail(t.id);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors"
                            >
                              Manage
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-[#E5DFC5] flex items-center justify-between text-xs text-[#667266]">
                <div>
                  Showing Page <span className="font-bold text-[#222922]">{page}</span> of{" "}
                  <span className="font-bold text-[#222922]">{totalPages}</span> ({totalTickets}{" "}
                  tickets)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1.5 rounded-lg border border-[#E5DFC5] disabled:opacity-40 hover:bg-[#F7F3EA] font-semibold transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1.5 rounded-lg border border-[#E5DFC5] disabled:opacity-40 hover:bg-[#F7F3EA] font-semibold transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FAQ MANAGEMENT TAB */}
      {/* ========================================================================= */}
      {activeTab === "faqs" && (
        <div className="bg-white rounded-2xl border border-[#E5DFC5] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F7F3EA] border-b border-[#E5DFC5] text-[11px] font-bold text-[#667266] uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">Order</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Question</th>
                  <th className="py-3 px-4">Answer Preview</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E2D2]">
                {faqs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#667266]">
                      <HelpCircle className="w-8 h-8 mx-auto mb-2 text-[#8A9A86] opacity-60" />
                      <div className="font-bold text-sm text-[#222922]">No FAQs created yet</div>
                      <p className="text-xs text-[#8A9A86] mt-0.5">
                        Add frequently asked questions to help customers self-serve.
                      </p>
                    </td>
                  </tr>
                ) : (
                  faqs.map((f) => (
                    <tr key={f.id} className="hover:bg-[#FDFBF7] transition-colors">
                      <td className="py-3 px-4 text-center font-bold text-[#8A9A86]">
                        {f.orderIndex}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#354B35]">
                        <span className="px-2 py-0.5 rounded-full bg-[#EBF0E9] text-[10px] font-bold">
                          {CATEGORY_LABELS[f.category] || f.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-[#222922] max-w-[240px]">
                        {f.question}
                      </td>
                      <td className="py-3 px-4 text-[#667266] max-w-[320px] truncate">
                        {f.answer}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleFaqPublish(f)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors cursor-pointer ${
                            f.isPublished
                              ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                              : "bg-neutral-100 text-neutral-600 border-neutral-300 hover:bg-neutral-200"
                          }`}
                        >
                          {f.isPublished ? "Published" : "Draft (Hidden)"}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditFaq(f)}
                            className="p-1.5 rounded-lg border border-[#E5DFC5] text-[#354B35] hover:bg-[#F7F3EA] transition-colors cursor-pointer"
                            title="Edit FAQ"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteFaq(f.id)}
                            className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Delete FAQ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TICKET DETAIL DRAWER / MODAL */}
      {/* ========================================================================= */}
      {selectedTicketId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
          <div className="w-full max-w-3xl bg-[#FDFBF7] h-full shadow-2xl flex flex-col border-l border-[#E5DFC5] overflow-hidden">
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 bg-white border-b border-[#E5DFC5] flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-black text-sm text-[#354B35]">
                    {ticketDetail?.ticketNumber || "Ticket"}
                  </span>
                  {ticketDetail && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        STATUS_CONFIG[ticketDetail.status]?.bg
                      } ${STATUS_CONFIG[ticketDetail.status]?.text} ${
                        STATUS_CONFIG[ticketDetail.status]?.border
                      }`}
                    >
                      {STATUS_CONFIG[ticketDetail.status]?.label}
                    </span>
                  )}
                  {ticketDetail && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        PRIORITY_BADGES[ticketDetail.priority]?.color
                      }`}
                    >
                      {PRIORITY_BADGES[ticketDetail.priority]?.label} Priority
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-base text-[#222922] truncate mt-1">
                  {ticketDetail?.subject || "Loading ticket..."}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeTicketDetail}
                className="p-2 rounded-xl text-[#8A9A86] hover:text-[#222922] hover:bg-[#F7F3EA] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Scrollable Body */}
            {detailLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[#8A9A86]">
                <RefreshCw className="w-8 h-8 animate-spin text-[#354B35] mb-2" />
                <span className="text-xs font-semibold">Loading ticket history & notes...</span>
              </div>
            ) : ticketDetail ? (
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                {/* Customer and Order Info Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Customer Card */}
                  <div className="p-3.5 rounded-2xl bg-white border border-[#E5DFC5] shadow-xs">
                    <div className="flex items-center gap-2 text-[#354B35] font-bold text-xs mb-2">
                      <User className="w-4 h-4 text-[#B99A60]" />
                      <span>Customer Details</span>
                    </div>
                    <div className="text-xs space-y-1">
                      <div className="font-bold text-[#222922]">
                        {ticketDetail.customer?.name || "Customer"}
                      </div>
                      <div className="text-[#667266]">{ticketDetail.customer?.email}</div>
                      {ticketDetail.customer?.phone && (
                        <div className="text-[#667266]">📞 {ticketDetail.customer?.phone}</div>
                      )}
                    </div>
                  </div>

                  {/* Linked Order Card */}
                  <div className="p-3.5 rounded-2xl bg-white border border-[#E5DFC5] shadow-xs">
                    <div className="flex items-center gap-2 text-[#354B35] font-bold text-xs mb-2">
                      <ShoppingBag className="w-4 h-4 text-[#B99A60]" />
                      <span>Linked Order</span>
                    </div>
                    {ticketDetail.order ? (
                      <div className="text-xs space-y-1">
                        <div className="font-mono font-bold text-[#222922]">
                          #{ticketDetail.order.orderNumber}
                        </div>
                        <div className="flex items-center justify-between text-[#667266]">
                          <span>Status:</span>
                          <span className="font-semibold text-[#354B35]">
                            {ticketDetail.order.orderStatus}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[#667266]">
                          <span>Grand Total:</span>
                          <span className="font-bold text-[#222922]">
                            ₹{ticketDetail.order.grandTotal}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-[#8A9A86] italic py-2">
                        No specific order linked to this ticket.
                      </div>
                    )}
                  </div>
                </div>

                {/* Ticket Description / Initial Query */}
                <div className="p-4 rounded-2xl bg-[#F7F3EA] border border-[#E8E2D2]">
                  <div className="flex items-center justify-between text-[11px] text-[#8A9A86] mb-2 font-medium">
                    <span className="font-bold text-[#354B35]">Original Request Description</span>
                    <span>
                      {new Date(ticketDetail.createdAt).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-[#222922] whitespace-pre-wrap">
                    {ticketDetail.description}
                  </p>

                  {/* Initial Attachments */}
                  {ticketDetail.attachments && ticketDetail.attachments.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[#E8E2D2] space-y-1.5">
                      <div className="text-[11px] font-bold text-[#667266] uppercase tracking-wider">
                        Attachments ({ticketDetail.attachments.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {ticketDetail.attachments.map((att, idx) => (
                          <a
                            key={idx}
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#E5DFC5] text-xs font-semibold text-[#354B35] hover:bg-[#FDFBF7]"
                          >
                            <Paperclip className="w-3.5 h-3.5 text-[#B99A60]" />
                            <span className="truncate max-w-[160px]">
                              {att.fileName || `Attachment ${idx + 1}`}
                            </span>
                            <ExternalLink className="w-3 h-3 text-[#8A9A86]" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Conversation & Notes Stream */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-[#667266] uppercase tracking-wider px-1">
                    <span>Conversation & Audit Log ({ticketDetail.messages.length})</span>
                    <span className="text-[11px] font-normal text-[#8A9A86]">
                      🔒 Yellow boxes are internal team notes
                    </span>
                  </div>

                  <div className="space-y-3">
                    {ticketDetail.messages.map((m, idx) => {
                      // System message
                      if (m.senderRole === "SYSTEM") {
                        return (
                          <div
                            key={idx}
                            className="text-center py-2 px-3 rounded-xl bg-[#E8E2D2]/50 text-[11px] text-[#667266] font-medium max-w-md mx-auto"
                          >
                            {m.message}
                          </div>
                        );
                      }

                      // Internal Note (Team Only)
                      if (m.isInternalNote) {
                        return (
                          <div
                            key={idx}
                            className="p-4 rounded-2xl bg-amber-50/90 border-2 border-amber-300 shadow-xs"
                          >
                            <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-amber-900 mb-1.5">
                              <div className="flex items-center gap-1.5">
                                <Lock className="w-3.5 h-3.5 text-amber-700" />
                                <span>INTERNAL TEAM NOTE — NOT VISIBLE TO CUSTOMER</span>
                              </div>
                              <span className="font-normal text-amber-800 text-[10px]">
                                {new Date(m.createdAt).toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <div className="text-xs text-amber-950 font-medium whitespace-pre-wrap">
                              {m.message}
                            </div>
                            <div className="text-[10px] text-amber-700 font-semibold mt-2">
                              Logged by {m.senderName || "Admin Staff"}
                            </div>
                          </div>
                        );
                      }

                      // Customer or Admin reply
                      const isAdmin = m.senderRole === "ADMIN";

                      return (
                        <div
                          key={idx}
                          className={`flex flex-col ${isAdmin ? "items-end" : "items-start"}`}
                        >
                          <div
                            className={`p-4 rounded-2xl max-w-xl text-xs shadow-xs ${
                              isAdmin
                                ? "bg-[#354B35] text-[#F7F3EA] rounded-br-none"
                                : "bg-white border border-[#E5DFC5] text-[#222922] rounded-bl-none"
                            }`}
                          >
                            <div
                              className={`flex items-center justify-between gap-4 text-[10px] font-bold mb-1.5 ${
                                isAdmin ? "text-[#DFC89B]" : "text-[#8A9A86]"
                              }`}
                            >
                              <span>{isAdmin ? "BentoBabu Support" : m.senderName || "Customer"}</span>
                              <span>
                                {new Date(m.createdAt).toLocaleDateString("en-IN", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap leading-relaxed">{m.message}</p>

                            {m.attachments && m.attachments.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-white/20 space-y-1">
                                {m.attachments.map((att, aIdx) => (
                                  <a
                                    key={aIdx}
                                    href={att.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 underline text-[11px] opacity-90 hover:opacity-100"
                                  >
                                    <Paperclip className="w-3 h-3" />
                                    <span>{att.fileName || "View Attachment"}</span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Status & Resolution Controls */}
                <div className="p-4 rounded-2xl bg-white border border-[#E5DFC5] shadow-xs space-y-3">
                  <div className="text-xs font-bold text-[#354B35] uppercase tracking-wider">
                    Ticket Lifecycle & Status Control
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value as TicketStatus)}
                      className="px-3 py-2 bg-[#F7F3EA] border border-[#E8E2D2] rounded-xl text-xs font-bold text-[#222922]"
                    >
                      <option value="OPEN">Status: OPEN</option>
                      <option value="IN_PROGRESS">Status: IN PROGRESS</option>
                      <option value="WAITING_FOR_CUSTOMER">Status: WAITING FOR CUSTOMER</option>
                      <option value="RESOLVED">Status: RESOLVED</option>
                      <option value="CLOSED">Status: CLOSED</option>
                    </select>

                    <input
                      type="text"
                      placeholder="Optional resolution note or closing reason..."
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      className="flex-1 px-3 py-2 bg-[#F7F3EA] border border-[#E8E2D2] rounded-xl text-xs text-[#222922]"
                    />

                    <button
                      type="button"
                      onClick={handleUpdateStatus}
                      disabled={updatingStatus}
                      className="px-4 py-2 bg-[#354B35] text-white rounded-xl text-xs font-bold hover:bg-[#253525] transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      {updatingStatus ? "Updating..." : "Update Status"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Bottom Composer: Reply to Customer vs Internal Note */}
            {ticketDetail && (
              <div className="p-4 bg-white border-t border-[#E5DFC5] shrink-0">
                <form onSubmit={handleSendReply} className="space-y-3">
                  {/* Mode Selector */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsInternalNote(false)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        !isInternalNote
                          ? "bg-[#354B35] text-white shadow-xs"
                          : "bg-[#F7F3EA] text-[#667266] hover:bg-[#E8E2D2]"
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Reply to Customer</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsInternalNote(true)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isInternalNote
                          ? "bg-amber-600 text-white shadow-xs"
                          : "bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100"
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Internal Team Note (Private)</span>
                    </button>
                  </div>

                  <div className="relative">
                    <textarea
                      rows={3}
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder={
                        isInternalNote
                          ? "Add a private team note (only staff & admin will see this)..."
                          : "Type your reply to the customer (they will receive in-app & email notification)..."
                      }
                      className={`w-full p-3 rounded-xl text-xs text-[#222922] focus:outline-hidden resize-none transition-colors ${
                        isInternalNote
                          ? "bg-amber-50/60 border-2 border-amber-300 placeholder:text-amber-700/60"
                          : "bg-[#F7F3EA] border border-[#E8E2D2] placeholder:text-[#8A9A86] focus:border-[#354B35]"
                      }`}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#8A9A86]">
                      {isInternalNote
                        ? "🔒 Secure note recorded for staff audit"
                        : "✉️ Customer notified immediately"}
                    </span>
                    <button
                      type="submit"
                      disabled={sendingReply || !replyMessage.trim()}
                      className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50 cursor-pointer ${
                        isInternalNote
                          ? "bg-amber-700 hover:bg-amber-800"
                          : "bg-[#354B35] hover:bg-[#253525]"
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{sendingReply ? "Sending..." : isInternalNote ? "Save Internal Note" : "Send Reply"}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FAQ ADD / EDIT MODAL */}
      {/* ========================================================================= */}
      {faqModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#E5DFC5] animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5DFC5] mb-4">
              <h3 className="font-bold text-base text-[#222922]">
                {editingFaq ? "Edit FAQ Item" : "Create New FAQ"}
              </h3>
              <button
                type="button"
                onClick={() => setFaqModalOpen(false)}
                className="p-1.5 rounded-lg text-[#8A9A86] hover:text-[#222922]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFaq} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#354B35] mb-1">
                  Question *
                </label>
                <input
                  type="text"
                  required
                  value={faqForm.question}
                  onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
                  placeholder="e.g. How do I track my order delivery?"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E2D2] bg-[#F7F3EA] text-xs text-[#222922] focus:outline-hidden focus:border-[#354B35]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#354B35] mb-1">
                  Answer *
                </label>
                <textarea
                  rows={4}
                  required
                  value={faqForm.answer}
                  onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
                  placeholder="Provide a clear, detailed answer..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E2D2] bg-[#F7F3EA] text-xs text-[#222922] focus:outline-hidden focus:border-[#354B35]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#354B35] mb-1">
                    Category
                  </label>
                  <select
                    value={faqForm.category}
                    onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8E2D2] bg-[#F7F3EA] text-xs font-semibold text-[#222922]"
                  >
                    <option value="GENERAL">General Support</option>
                    <option value="ORDERING">Ordering & Menu</option>
                    <option value="DELIVERY">Delivery & Timing</option>
                    <option value="PAYMENTS">Payments & COD</option>
                    <option value="CANCELLATIONS">Cancellations</option>
                    <option value="REFUNDS">Refunds & Returns</option>
                    <option value="FOOD_AND_INGREDIENTS">Food & Ingredients</option>
                    <option value="ACCOUNT_MANAGEMENT">Account & Settings</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#354B35] mb-1">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={faqForm.orderIndex}
                    onChange={(e) =>
                      setFaqForm({ ...faqForm, orderIndex: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E8E2D2] bg-[#F7F3EA] text-xs text-[#222922]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="faqPublished"
                  checked={faqForm.isPublished}
                  onChange={(e) => setFaqForm({ ...faqForm, isPublished: e.target.checked })}
                  className="rounded border-[#E5DFC5] text-[#354B35] focus:ring-[#354B35]"
                />
                <label htmlFor="faqPublished" className="text-xs font-bold text-[#222922]">
                  Publish this FAQ immediately to the customer support page
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#E5DFC5]">
                <button
                  type="button"
                  onClick={() => setFaqModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#E5DFC5] text-xs font-bold text-[#667266] hover:bg-[#F7F3EA]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingFaq}
                  className="px-5 py-2 rounded-xl bg-[#354B35] text-white text-xs font-bold hover:bg-[#253525] transition-colors disabled:opacity-50"
                >
                  {savingFaq ? "Saving..." : editingFaq ? "Save Changes" : "Create FAQ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
