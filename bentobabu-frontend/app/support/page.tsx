"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  HelpCircle,
  MessageSquare,
  Phone,
  Mail,
  Clock,
  MapPin,
  PlusCircle,
  Send,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  X,
  Search,
  Package,
  CreditCard,
  Truck,
  HeartHandshake,
  Utensils,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useAuth } from "@/context/AuthContext";
import { supportService, CreateTicketPayload } from "@/services/supportService";
import { orderService } from "@/services/orderService";
import {
  SupportTicket,
  SupportFaq,
  SupportConfig,
  TicketCategory,
  Order,
} from "@/types";

const CATEGORY_CARDS = [
  {
    category: "ORDER_ISSUE" as TicketCategory,
    title: "Order Issue",
    desc: "Delays, packaging, or order status",
    icon: Package,
    color: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    category: "DELIVERY_ISSUE" as TicketCategory,
    title: "Delivery Help",
    desc: "Rider contact, address, or OTP",
    icon: Truck,
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    category: "PAYMENT_ISSUE" as TicketCategory,
    title: "Payment & Billing",
    desc: "UPI, card charge, or failed transaction",
    icon: CreditCard,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    category: "FOOD_QUALITY" as TicketCategory,
    title: "Food Quality",
    desc: "Taste, temperature, or ingredient concern",
    icon: Utensils,
    color: "bg-rose-50 text-rose-700 border-rose-200",
  },
  {
    category: "REFUND_REQUEST" as TicketCategory,
    title: "Refunds",
    desc: "Order cancellations and refund status",
    icon: RefreshCw,
    color: "bg-purple-50 text-purple-700 border-purple-200",
  },
  {
    category: "OTHER" as TicketCategory,
    title: "General Inquiries",
    desc: "Feedback, dietary queries, partnerships",
    icon: HeartHandshake,
    color: "bg-stone-50 text-stone-700 border-stone-200",
  },
];

export default function SupportPage() {
  const { user, isAuthenticated } = useAuth();

  // Tab: "faqs" | "tickets"
  const [activeTab, setActiveTab] = useState<"faqs" | "tickets">("faqs");

  // Config & FAQs
  const [config, setConfig] = useState<SupportConfig | null>(null);
  const [faqs, setFaqs] = useState<SupportFaq[]>([]);
  const [selectedFaqCategory, setSelectedFaqCategory] = useState<string>("ALL");
  const [faqSearchQuery, setFaqSearchQuery] = useState("");
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  // Tickets
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [isLoadingTicketDetail, setIsLoadingTicketDetail] = useState(false);

  // Customer orders for linking
  const [myOrders, setMyOrders] = useState<Order[]>([]);

  // Create Ticket Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [formData, setFormData] = useState<{
    subject: string;
    category: TicketCategory;
    description: string;
    orderId: string;
    attachments: Array<{ url: string; fileName: string; mimeType: string; sizeBytes: number }>;
  }>({
    subject: "",
    category: "ORDER_ISSUE",
    description: "",
    orderId: "",
    attachments: [],
  });
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Reply state
  const [replyMessage, setReplyMessage] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Load initial public config & FAQs
  useEffect(() => {
    supportService.getConfig().then(setConfig).catch(() => { });
    supportService.getFaqs().then(setFaqs).catch(() => { });
  }, []);

  // Load tickets and orders when user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadTickets();
      orderService.getAll().then(setMyOrders).catch(() => { });
    }
  }, [isAuthenticated]);

  const loadTickets = async () => {
    try {
      setIsLoadingTickets(true);
      const res = await supportService.getMyTickets();
      setTickets(res.tickets);
    } catch {
      // ignore
    } finally {
      setIsLoadingTickets(false);
    }
  };

  const openTicketDetail = async (id: string) => {
    try {
      setIsLoadingTicketDetail(true);
      setReplyError(null);
      const detail = await supportService.getTicketById(id);
      setSelectedTicket(detail);
    } catch (err: any) {
      alert(err?.response?.data?.message || "Failed to load ticket details.");
    } finally {
      setIsLoadingTicketDetail(false);
    }
  };

  const handleOpenCreateForCategory = (cat: TicketCategory) => {
    setFormData((prev) => ({ ...prev, category: cat }));
    setCreateError(null);
    setCreateSuccess(null);
    setCreateModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.subject.trim() || !formData.description.trim()) {
      setCreateError("Please fill in both the subject and description.");
      return;
    }

    try {
      setIsSubmittingTicket(true);
      setCreateError(null);

      const payload: CreateTicketPayload = {
        subject: formData.subject.trim(),
        category: formData.category,
        description: formData.description.trim(),
        orderId: formData.orderId || undefined,
        attachments: formData.attachments.length > 0 ? formData.attachments : undefined,
      };

      const created = await supportService.createTicket(payload);
      setCreateSuccess(`Ticket #${created.ticketNumber} created successfully! Our team will reply shortly.`);

      setFormData({
        subject: "",
        category: "ORDER_ISSUE",
        description: "",
        orderId: "",
        attachments: [],
      });

      await loadTickets();
      setTimeout(() => {
        setCreateModalOpen(false);
        setCreateSuccess(null);
        setActiveTab("tickets");
      }, 1500);
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || "Failed to submit ticket. Please check inputs and retry.");
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setCreateError("File is too large. Maximum attachment size is 5MB.");
      return;
    }

    try {
      const res = await supportService.uploadAttachment(file);
      setFormData((prev) => ({
        ...prev,
        attachments: [...prev.attachments, res],
      }));
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || "Failed to upload file.");
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyMessage.trim()) return;

    try {
      setIsSubmittingReply(true);
      setReplyError(null);
      await supportService.replyToTicket(selectedTicket.id, replyMessage.trim());
      setReplyMessage("");
      // Reload ticket detail
      const refreshed = await supportService.getTicketById(selectedTicket.id);
      setSelectedTicket(refreshed);
      loadTickets();
    } catch (err: any) {
      setReplyError(err?.response?.data?.message || "Failed to send message.");
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // Filter FAQs
  const filteredFaqs = faqs.filter((faq) => {
    const matchesCategory =
      selectedFaqCategory === "ALL" || faq.category === selectedFaqCategory;
    const matchesSearch =
      !faqSearchQuery.trim() ||
      faq.question.toLowerCase().includes(faqSearchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(faqSearchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "OPEN":
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800">Open</span>;
      case "IN_PROGRESS":
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">In Progress</span>;
      case "WAITING_FOR_CUSTOMER":
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800">Awaiting Reply</span>;
      case "RESOLVED":
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">Resolved</span>;
      case "CLOSED":
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-700">Closed</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF9F5] text-[#241C1A] flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 w-full space-y-12">
        {/* 1. Hero Section */}
        <section className="bg-gradient-to-br from-[#243324] to-[#1B261B] text-[#EDE8DE] rounded-3xl p-6 sm:p-10 shadow-sm relative overflow-hidden">
          <div className="max-w-2xl space-y-3 relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#354B35] text-[#B99A60] text-xs font-semibold uppercase tracking-wider">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Customer Care & Support</span>
            </div>
            <h1 className="font-serif font-bold text-2xl sm:text-4xl text-white leading-tight">
              How can our kitchen care team assist you today?
            </h1>
            <p className="text-sm text-[#B5C4B1] leading-relaxed">
              We take immense pride in crafting nutritious, wholesome bentos. If something wasn&apos;t quite right with your delivery, payment, or meal, we are here to make it right promptly.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => {
                    setCreateError(null);
                    setCreateSuccess(null);
                    setCreateModalOpen(true);
                  }}
                  className="px-5 py-3 rounded-2xl bg-[#C86D51] text-white font-bold text-xs hover:bg-[#B35D42] transition-colors shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Submit Support Request</span>
                </button>
              ) : (
                <Link
                  href="/login?redirect=/support"
                  className="px-5 py-3 rounded-2xl bg-[#C86D51] text-white font-bold text-xs hover:bg-[#B35D42] transition-colors shadow-md flex items-center gap-2"
                >
                  <span>Log in to Submit Request</span>
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* 2. Quick Issue Cards */}
        <section className="space-y-4">
          <div className="border-b border-[#EFECE6] pb-2">
            <h2 className="font-serif font-bold text-lg text-[#241C1A]">
              Quick Help by Topic
            </h2>
            <p className="text-xs text-gray-500">
              Select an area to quickly submit a pre-categorized request or browse answers.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {CATEGORY_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.category}
                  type="button"
                  onClick={() => {
                    if (isAuthenticated) {
                      handleOpenCreateForCategory(card.category);
                    } else {
                      window.location.href = `/login?redirect=/support`;
                    }
                  }}
                  className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all hover:scale-102 hover:shadow-sm cursor-pointer ${card.color}`}
                >
                  <div className="w-9 h-9 rounded-xl bg-white/80 flex items-center justify-center mb-2 shadow-2xs">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xs">{card.title}</h3>
                    <p className="text-[10px] opacity-80 line-clamp-2 mt-0.5">
                      {card.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 3. Main Tabs: FAQs vs My Tickets */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 border-b border-[#EFECE6] pb-3">
            <button
              type="button"
              onClick={() => setActiveTab("faqs")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${activeTab === "faqs"
                  ? "bg-[#243324] text-white shadow-xs"
                  : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
            >
              Frequently Asked Questions ({faqs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("tickets")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${activeTab === "tickets"
                  ? "bg-[#243324] text-white shadow-xs"
                  : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>My Support Tickets</span>
              {tickets.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-[#C86D51] text-white text-[10px]">
                  {tickets.length}
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: FAQs */}
          {activeTab === "faqs" && (
            <div className="space-y-6">
              {/* FAQ Search & Category Filter */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search answers (e.g. delivery OTP, refund, cancel)..."
                    value={faqSearchQuery}
                    onChange={(e) => setFaqSearchQuery(e.target.value)}
                    className="w-full pl-9.5 pr-4 py-2.5 rounded-2xl bg-white border border-[#E5DFC5] text-xs focus:outline-none focus:border-[#C86D51]"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  {["ALL", "ORDERING", "DELIVERY", "PAYMENTS", "CANCELLATIONS", "REFUNDS", "FOOD_AND_INGREDIENTS"].map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedFaqCategory(cat)}
                        className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer transition-colors ${selectedFaqCategory === cat
                            ? "bg-[#C86D51] text-white"
                            : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                      >
                        {cat === "ALL" ? "All FAQs" : cat.replace(/_/g, " ")}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Accordion list */}
              {filteredFaqs.length === 0 ? (
                <div className="bg-white rounded-3xl p-8 text-center border border-[#EFECE6] space-y-2">
                  <HelpCircle className="w-8 h-8 text-gray-400 mx-auto" />
                  <p className="font-bold text-sm">No FAQs found matching your criteria.</p>
                  <p className="text-xs text-gray-500">
                    Try another search term or click &ldquo;Submit Support Request&rdquo; to speak directly with our team.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredFaqs.map((faq, idx) => {
                    const isOpen = openFaqIndex === idx;
                    return (
                      <div
                        key={faq.id || idx}
                        className="bg-white rounded-2xl border border-[#E5DFC5] overflow-hidden transition-all duration-200"
                      >
                        <button
                          type="button"
                          onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                          className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 font-bold text-xs sm:text-sm text-[#222922] hover:text-[#C86D51] transition-colors cursor-pointer"
                        >
                          <span>{faq.question}</span>
                          <ChevronDown
                            className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180 text-[#C86D51]" : ""
                              }`}
                          />
                        </button>
                        {isOpen && (
                          <div className="px-5 pb-4 pt-1 text-xs text-gray-600 leading-relaxed border-t border-[#F0ECE1]">
                            {faq.answer}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: My Support Tickets */}
          {activeTab === "tickets" && (
            <div className="space-y-4">
              {!isAuthenticated ? (
                <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-[#EFECE6] space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto font-bold">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-base">Log in to view your tickets</h3>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    Track existing inquiries, read responses from our chef and support team, and follow up directly.
                  </p>
                  <Link
                    href="/login?redirect=/support"
                    className="inline-flex px-6 py-2.5 rounded-2xl bg-[#C86D51] text-white font-bold text-xs hover:bg-[#B35D42] transition-colors"
                  >
                    Log In to BentoBabu
                  </Link>
                </div>
              ) : isLoadingTickets ? (
                <div className="p-8 text-center text-xs text-gray-500">Loading your tickets...</div>
              ) : tickets.length === 0 ? (
                <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-[#EFECE6] space-y-4">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h3 className="font-bold text-base">You have no active support tickets</h3>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    Need help with an ongoing order, delivery, or food query? Submit a ticket and our team will get right to work.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(true)}
                    className="px-6 py-2.5 rounded-2xl bg-[#C86D51] text-white font-bold text-xs hover:bg-[#B35D42] transition-colors cursor-pointer"
                  >
                    Open New Ticket
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tickets.map((t) => (
                    <article
                      key={t.id}
                      onClick={() => openTicketDetail(t.id)}
                      className="bg-white rounded-2xl p-5 border border-[#EFECE6] shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-gray-900">
                            #{t.ticketNumber}
                          </span>
                          <span className="text-[11px] text-gray-500 font-medium capitalize">
                            • {t.category.toLowerCase().replace(/_/g, " ")}
                          </span>
                        </div>
                        {getStatusBadge(t.status)}
                      </div>

                      <div className="space-y-1">
                        <h4 className="font-bold text-sm text-[#241C1A] line-clamp-1">
                          {t.subject}
                        </h4>
                        <p className="text-xs text-gray-500 line-clamp-2">
                          {t.lastMessageSnippet || t.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-[11px] text-gray-500">
                        {t.order ? (
                          <span className="font-mono">Order #{t.order.orderNumber}</span>
                        ) : (
                          <span>General Query</span>
                        )}
                        <span>{new Date(t.lastMessageAt || t.createdAt).toLocaleDateString()}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 4. Verified Contact Options */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EFECE6] shadow-sm space-y-6">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="font-serif font-bold text-lg text-[#241C1A]">
              Direct Contact & Kitchen Details
            </h2>
            <p className="text-xs text-gray-500">
              Verified communication channels with our kitchen hub and customer assistance executives.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-[#FBF9F6] border border-[#EFECE6] space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-[#241C1A]">
                <Phone className="w-4 h-4 text-[#C86D51]" />
                <span>Helpline Phone</span>
              </div>
              <p className="text-gray-600 font-mono font-semibold">
                {config?.phone || "+91 85840 85669"}
              </p>
              <div className="flex items-center gap-1 text-[11px] text-gray-500">
                <Clock className="w-3 h-3" />
                <span>{config?.operatingHours || "7:00 AM – 10:30 PM (Daily)"}</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#FBF9F6] border border-[#EFECE6] space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-[#241C1A]">
                <Mail className="w-4 h-4 text-[#C86D51]" />
                <span>Email Support</span>
              </div>
              <a
                href={`mailto:${config?.email || "care@bentobabu.in"}`}
                className="text-gray-600 hover:text-[#C86D51] font-medium block truncate"
              >
                {config?.email || "care@bentobabu.in"}
              </a>
              <span className="text-[11px] text-gray-500 block">
                Typical reply in under 2 hours
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#FBF9F6] border border-[#EFECE6] space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-[#241C1A]">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <span>WhatsApp Business</span>
              </div>
              {config?.isWhatsAppConfigured && config.whatsapp ? (
                <a
                  href={`https://wa.me/${config.whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-700 font-bold hover:underline inline-flex items-center gap-1"
                >
                  <span>Chat on WhatsApp</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <p className="text-gray-500 text-[11px]">
                  WhatsApp assistance temporarily paused. Use email or phone helpline.
                </p>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-[#FBF9F6] border border-[#EFECE6] space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-[#241C1A]">
                <MapPin className="w-4 h-4 text-[#C86D51]" />
                <span>Central Kitchen</span>
              </div>
              <p className="text-gray-600 text-[11px] leading-relaxed line-clamp-2">
                {config?.address || "Chandanpukur Bazar, Barrackpore, West Bengal 700120"}
              </p>
            </div>
          </div>
        </section>

        {/* 5. Create Ticket Modal */}
        {createModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-[#C86D51] flex items-center justify-center font-bold">
                    <PlusCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-[#241C1A]">Submit Support Request</h3>
                    <p className="text-[11px] text-gray-500">Our team will review and reply directly to your account.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {createError && (
                <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{createError}</span>
                </div>
              )}

              {createSuccess && (
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{createSuccess}</span>
                </div>
              )}

              <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Issue Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value as TicketCategory }))}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FBF9F6] border border-gray-300 focus:outline-none focus:border-[#C86D51]"
                  >
                    <option value="ORDER_ISSUE">Order Issue</option>
                    <option value="DELIVERY_ISSUE">Delivery Issue</option>
                    <option value="PAYMENT_ISSUE">Payment Issue</option>
                    <option value="MISSING_INCORRECT_ITEM">Missing or Incorrect Item</option>
                    <option value="FOOD_QUALITY">Food Quality Concern</option>
                    <option value="REFUND_REQUEST">Refund Request</option>
                    <option value="ACCOUNT_ISSUE">Account Issue</option>
                    <option value="OTHER">Other / Feedback</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Related Order (Optional)</label>
                  <select
                    value={formData.orderId}
                    onChange={(e) => setFormData((p) => ({ ...p, orderId: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FBF9F6] border border-gray-300 focus:outline-none focus:border-[#C86D51]"
                  >
                    <option value="">No specific order</option>
                    {myOrders.map((ord) => (
                      <option key={ord.id || ord._id} value={ord.id || ord._id}>
                        Order #{ord.orderNumber} (₹{ord.grandTotal || ord.total} • {ord.status || ord.orderStatus})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Subject *</label>
                  <input
                    type="text"
                    placeholder="Brief summary (e.g. Missing fork, meal delivered late)..."
                    value={formData.subject}
                    onChange={(e) => setFormData((p) => ({ ...p, subject: e.target.value }))}
                    maxLength={150}
                    required
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FBF9F6] border border-gray-300 focus:outline-none focus:border-[#C86D51]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Detailed Description *</label>
                  <textarea
                    rows={4}
                    placeholder="Please explain what happened so our team can resolve it..."
                    value={formData.description}
                    onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                    maxLength={3000}
                    required
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FBF9F6] border border-gray-300 focus:outline-none focus:border-[#C86D51] resize-none"
                  />
                </div>

                {/* Attachments */}
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Attachment (Optional photo/receipt, max 5MB)</label>
                  <div className="flex items-center gap-2">
                    <label className="px-4 py-2 rounded-2xl border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold cursor-pointer inline-flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>Upload File</span>
                      <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} className="hidden" />
                    </label>
                    <span className="text-[11px] text-gray-500">
                      {formData.attachments.length > 0
                        ? `${formData.attachments.length} attached`
                        : "JPG, PNG, PDF up to 5MB"}
                    </span>
                  </div>

                  {formData.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {formData.attachments.map((att, idx) => (
                        <div
                          key={idx}
                          className="px-2.5 py-1 rounded-xl bg-gray-100 text-gray-700 text-[11px] flex items-center gap-1.5"
                        >
                          <span className="truncate max-w-[120px]">{att.fileName}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setFormData((p) => ({
                                ...p,
                                attachments: p.attachments.filter((_, i) => i !== idx),
                              }))
                            }
                            className="text-gray-400 hover:text-red-600"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="px-4 py-2.5 rounded-2xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingTicket}
                    className="px-6 py-2.5 rounded-2xl bg-[#C86D51] text-white font-bold hover:bg-[#B35D42] disabled:opacity-50 transition-colors shadow-xs"
                  >
                    {isSubmittingTicket ? "Submitting..." : "Submit Ticket"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 6. Ticket Conversation Thread Modal */}
        {selectedTicket && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 space-y-4 shadow-2xl border border-gray-100 max-h-[92vh] flex flex-col">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-gray-100 pb-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-[#241C1A]">
                      #{selectedTicket.ticketNumber}
                    </span>
                    {getStatusBadge(selectedTicket.status)}
                  </div>
                  <h3 className="font-bold text-sm sm:text-base text-[#241C1A]">
                    {selectedTicket.subject}
                  </h3>
                  {selectedTicket.order && (
                    <p className="text-[11px] text-gray-500 font-mono">
                      Linked Order: #{selectedTicket.order.orderNumber} (₹{selectedTicket.order.grandTotal})
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTicket(null)}
                  className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Messages Stream */}
              <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-xs">
                {selectedTicket.messages?.map((msg, i) => {
                  const isStaff = msg.senderRole === "ADMIN";
                  return (
                    <div
                      key={msg.id || i}
                      className={`flex flex-col ${isStaff ? "items-start" : "items-end"}`}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-1 px-1">
                        <span className="font-bold">
                          {isStaff ? "BentoBabu Support" : "You"}
                        </span>
                        <span>•</span>
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      <div
                        className={`p-3.5 rounded-2xl max-w-[85%] leading-relaxed ${isStaff
                            ? "bg-[#F5F2EB] text-[#241C1A] rounded-tl-xs"
                            : "bg-[#243324] text-[#EDE8DE] rounded-tr-xs"
                          }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.message}</p>

                        {/* Attachments in message */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-black/10 flex flex-wrap gap-1.5">
                            {msg.attachments.map((att, attIdx) => (
                              <a
                                key={attIdx}
                                href={att.url}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2 py-0.5 rounded-lg bg-black/10 text-[10px] font-bold hover:underline inline-flex items-center gap-1"
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

              {/* Reply Box */}
              {selectedTicket.status === "CLOSED" ? (
                <div className="p-3 rounded-2xl bg-gray-50 border border-gray-200 text-center text-xs text-gray-500">
                  This support ticket is marked as <strong>Closed</strong>. If you require further assistance, please submit a new request.
                </div>
              ) : (
                <form onSubmit={handleSendReply} className="pt-2 border-t border-gray-100 space-y-2">
                  {replyError && (
                    <div className="text-xs text-red-600">{replyError}</div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Type your response to support staff..."
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      disabled={isSubmittingReply}
                      className="flex-1 px-4 py-2.5 rounded-2xl bg-[#FBF9F6] border border-gray-300 text-xs focus:outline-none focus:border-[#C86D51]"
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingReply || !replyMessage.trim()}
                      className="px-4 py-2.5 rounded-2xl bg-[#C86D51] text-white font-bold text-xs hover:bg-[#B35D42] disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
