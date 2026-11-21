"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  ShoppingBag,
  User as UserIcon,
  Menu as MenuIcon,
  X,
  Phone,
  Sparkles,
  ChevronDown,
  LogOut,
  Package,
  MapPin,
  ArrowRight,
  UtensilsCrossed,
  Home,
  BookOpen,
  HelpCircle,
  MessageCircle,
  Video,
} from "lucide-react";
import { brandConfig } from "@/config/brand";
import { useAppSelector } from "@/store/hooks";
import { useCategories } from "@/hooks/useQueries";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { buildLoginUrl, buildRegisterUrl } from "@/lib/authRedirect";

const emptySubscribe = () => () => {};

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const isMounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [collectionsDropdownOpen, setCollectionsDropdownOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  const { user, status, logout } = useAuth();

  const accountMenuRef = useRef<HTMLDivElement>(null);
  const collectionsMenuRef = useRef<HTMLDivElement>(null);

  const loginHref = buildLoginUrl(pathname);
  const registerHref = buildRegisterUrl(pathname);

  // Close menus on route change without triggering cascading effects
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
    setCollectionsDropdownOpen(false);
  }

  // Click outside listener for dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
      if (collectionsMenuRef.current && !collectionsMenuRef.current.contains(target)) {
        setCollectionsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
    await logout();
    router.push("/menu");
  };

  const cartItems = useAppSelector((state) => state.cart.items);
  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  const { data: categories = [] } = useCategories();

  return (
    <header className="sticky top-0 z-40 w-full bg-[#FDFBF7]/95 backdrop-blur-md border-b border-[#E8E2D2]/80 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.03)] transition-all">
      {/* Top Announcement Bar */}
      <div className="bg-[#243324] text-[#EDE8DE] text-[11px] sm:text-xs py-2 px-4 border-b border-[#354B35]/40 font-medium">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 truncate">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#DFC89B]/15 text-[#DFC89B] text-[10px] font-bold uppercase tracking-wider shrink-0">
              <Sparkles className="w-3 h-3 text-[#DFC89B]" />
              <span>Farm Fresh</span>
            </span>
            <span className="truncate text-[#E5DFC5]">
              Daily organic harvest • Zero preservatives • Free express delivery above ₹499
            </span>
          </div>
          <div className="hidden md:flex items-center gap-5 text-xs text-[#DFC89B]/90 shrink-0">
            <a
              href={`tel:${brandConfig.contact.phone.replace(/[^0-9+]/g, "")}`}
              className="flex items-center gap-1.5 hover:text-[#F7F3EA] transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-[#B99A60]" />
              <span>{brandConfig.contact.phone}</span>
            </a>
            <span className="text-white/30">•</span>
            <span className="text-[#EDE8DE]/80">{brandConfig.contact.operatingHours}</span>
          </div>
        </div>
      </div>

      {/* Main Nav Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18 sm:h-20 gap-4">
          {/* Brand Identity */}
          <Link
            href="/"
            className="flex items-center group shrink-0 py-1"
            aria-label={brandConfig.name}
          >
            <div className="relative h-12 sm:h-14 md:h-15 w-auto flex items-center group-hover:scale-102 transition-transform duration-200">
              <Image
                src={brandConfig.logo.imagePath}
                alt={brandConfig.name}
                width={220}
                height={110}
                className="h-12 sm:h-14 md:h-15 w-auto max-w-[220px] object-contain drop-shadow-xs"
                priority
              />
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
            <Link
              href="/"
              className={`px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all ${
                pathname === "/"
                  ? "bg-[#354B35] text-[#F7F3EA] shadow-xs"
                  : "text-[#354B35] hover:bg-[#354B35]/8 hover:text-[#222922]"
              }`}
            >
              Home
            </Link>

            <Link
              href="/menu"
              className={`px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 ${
                pathname === "/menu"
                  ? "bg-[#354B35] text-[#F7F3EA] shadow-xs"
                  : "text-[#354B35] hover:bg-[#354B35]/8 hover:text-[#222922]"
              }`}
            >
              <span>Explore Menu</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#B99A60]" />
            </Link>

            <Link
              href="/videos"
              className={`px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all ${
                pathname.startsWith("/videos")
                  ? "bg-[#354B35] text-[#F7F3EA] shadow-xs"
                  : "text-[#354B35] hover:bg-[#354B35]/8 hover:text-[#222922]"
              }`}
            >
              Videos
            </Link>

            {/* Collections Dropdown */}
            <div
              className="relative"
              ref={collectionsMenuRef}
              onMouseEnter={() => setCollectionsDropdownOpen(true)}
              onMouseLeave={() => setCollectionsDropdownOpen(false)}
            >
              <button
                type="button"
                onClick={() => setCollectionsDropdownOpen((prev) => !prev)}
                className={`px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 cursor-pointer ${
                  pathname.startsWith("/categories") || collectionsDropdownOpen
                    ? "bg-[#354B35]/10 text-[#354B35]"
                    : "text-[#354B35] hover:bg-[#354B35]/8 hover:text-[#222922]"
                }`}
                aria-expanded={collectionsDropdownOpen}
              >
                <span>Collections</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    collectionsDropdownOpen ? "rotate-180 text-[#8C713B]" : "text-[#8A9A86]"
                  }`}
                />
              </button>

              {collectionsDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-80 bg-white/98 backdrop-blur-md rounded-2xl shadow-xl border border-[#E5DFC5] p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#F0ECE1] mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#8C713B]">
                      Targeted Nutrition
                    </span>
                    <Link
                      href="/menu"
                      onClick={() => setCollectionsDropdownOpen(false)}
                      className="text-[11px] font-semibold text-[#354B35] hover:text-[#8C713B] transition-colors flex items-center gap-1"
                    >
                      <span>View All</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                  <div className="space-y-1">
                    {categories.length > 0 ? (
                      categories.map((cat) => (
                        <Link
                          key={cat.id || cat._id || cat.slug}
                          href={`/categories/${cat.slug}`}
                          onClick={() => setCollectionsDropdownOpen(false)}
                          className="group flex items-start gap-3 p-2.5 rounded-xl hover:bg-[#F7F3EA] transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-[#EBF0E9] text-[#354B35] group-hover:bg-[#354B35] group-hover:text-[#DFC89B] flex items-center justify-center shrink-0 transition-colors">
                            <UtensilsCrossed className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-[#222922] group-hover:text-[#354B35] transition-colors">
                              {cat.name}
                            </div>
                            {(cat.tagline || cat.description) && (
                              <div className="text-[11px] text-[#6B776A] truncate">
                                {cat.tagline || cat.description}
                              </div>
                            )}
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div className="p-4 text-center text-xs text-[#6B776A]">
                        No collections available.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Link
              href="/#why-choose-us"
              className="px-4 py-2 rounded-full text-xs font-semibold tracking-wide text-[#354B35] hover:bg-[#354B35]/8 hover:text-[#222922] transition-all"
            >
              Why Bento Babu
            </Link>

            <Link
              href="/#faq"
              className="px-4 py-2 rounded-full text-xs font-semibold tracking-wide text-[#354B35] hover:bg-[#354B35]/8 hover:text-[#222922] transition-all"
            >
              FAQ
            </Link>

            <Link
              href="/support"
              className={`px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all ${
                pathname.startsWith("/support")
                  ? "bg-[#354B35] text-[#F7F3EA] shadow-xs"
                  : "text-[#354B35] hover:bg-[#354B35]/8 hover:text-[#222922]"
              }`}
            >
              Support
            </Link>
          </nav>

          {/* Action Area: Cart, Notifications, Account Profile */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* 1. Shopping Cart Button */}
            <Link
              href="/cart"
              className="relative flex items-center gap-2 h-10 px-3.5 sm:px-4 rounded-full bg-[#354B35] hover:bg-[#253525] text-[#F7F3EA] shadow-xs hover:shadow-md transition-all group shrink-0 cursor-pointer"
              aria-label="View Shopping Cart"
            >
              <ShoppingBag className="w-4 h-4 text-[#DFC89B] group-hover:scale-110 transition-transform duration-200" />
              <span className="hidden sm:inline text-xs font-semibold tracking-wide">
                Cart
              </span>
              {isMounted && totalCartCount > 0 ? (
                <span className="inline-flex items-center justify-center bg-[#B99A60] text-[#1E2B1E] text-[11px] font-bold h-5 min-w-[20px] px-1.5 rounded-full shadow-xs">
                  {totalCartCount}
                </span>
              ) : null}
            </Link>

            {/* 2. Notification Bell (authenticated customer) */}
            {isMounted && status === "authenticated" && user && <NotificationBell />}

            {/* 3. Customer Profile Name / Profile Menu (or Sign In / Sign Up when logged out) */}
            {status === "loading" ? (
              <div className="hidden sm:flex items-center gap-2">
                <div
                  aria-hidden="true"
                  className="w-20 h-9 rounded-full bg-[#E5DFC5]/40 animate-pulse"
                />
              </div>
            ) : status === "authenticated" && user ? (
              <div className="relative" ref={accountMenuRef}>
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((prev) => !prev)}
                  className="hidden sm:flex items-center gap-2 pl-3 sm:pl-3.5 pr-2 py-1 rounded-full border border-[#E5DFC5] bg-white hover:bg-[#F7F3EA] hover:border-[#354B35]/30 text-[#354B35] text-xs font-medium transition-all shadow-xs cursor-pointer"
                  aria-expanded={accountMenuOpen}
                  aria-label="User account menu"
                >
                  <span className="max-w-[100px] md:max-w-[120px] truncate font-semibold text-[#222922]">
                    {user.name}
                  </span>
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#354B35] to-[#4B644B] text-[#DFC89B] flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                    {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                  </div>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-[#8A9A86] transition-transform duration-200 ${
                      accountMenuOpen ? "rotate-180 text-[#8C713B]" : ""
                    }`}
                  />
                </button>

                {/* Desktop Account Dropdown */}
                {accountMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white/98 backdrop-blur-md rounded-2xl shadow-xl border border-[#E5DFC5] p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E8E2D2] mb-2">
                      <div className="font-bold text-xs text-[#222922] truncate">{user.name}</div>
                      <div className="text-[11px] text-[#6B776A] truncate">{user.email}</div>
                    </div>
                    <div className="space-y-0.5">
                      <Link
                        href="/account"
                        onClick={() => setAccountMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#222922] hover:bg-[#F7F3EA] hover:text-[#354B35] transition-colors"
                      >
                        <UserIcon className="w-4 h-4 text-[#8A9A86]" />
                        <span>My Profile</span>
                      </Link>
                      <Link
                        href="/orders"
                        onClick={() => setAccountMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#222922] hover:bg-[#F7F3EA] hover:text-[#354B35] transition-colors"
                      >
                        <Package className="w-4 h-4 text-[#8A9A86]" />
                        <span>My Orders</span>
                      </Link>
                      <Link
                        href="/addresses"
                        onClick={() => setAccountMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#222922] hover:bg-[#F7F3EA] hover:text-[#354B35] transition-colors"
                      >
                        <MapPin className="w-4 h-4 text-[#8A9A86]" />
                        <span>Saved Addresses</span>
                      </Link>
                      <Link
                        href="/support"
                        onClick={() => setAccountMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#222922] hover:bg-[#F7F3EA] hover:text-[#354B35] transition-colors"
                      >
                        <HelpCircle className="w-4 h-4 text-[#8A9A86]" />
                        <span>Customer Support</span>
                      </Link>
                    </div>
                    <div className="pt-1.5 mt-1.5 border-t border-[#F0ECE1]">
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#C86D51] hover:bg-red-50 transition-colors cursor-pointer text-left"
                      >
                        <LogOut className="w-4 h-4 text-[#C86D51]" />
                        <span>Log Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  href={loginHref}
                  className="px-3.5 py-2 rounded-full text-xs font-semibold text-[#354B35] hover:bg-[#354B35]/8 transition-all"
                >
                  Sign In
                </Link>
                <Link
                  href={registerHref}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-[#354B35] text-[#F7F3EA] hover:bg-[#253525] transition-all shadow-xs hover:shadow-md"
                >
                  <span>Sign Up</span>
                  <ArrowRight className="w-3 h-3 text-[#DFC89B]" />
                </Link>
              </div>
            )}

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-full text-[#354B35] hover:bg-[#354B35]/10 transition-colors cursor-pointer"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-[#E8E2D2] bg-[#FDFBF7] px-4 pt-3 pb-6 space-y-4 animate-in slide-in-from-top duration-200 shadow-xl">
          {/* Main Navigation Links */}
          <div className="space-y-1">
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                pathname === "/"
                  ? "bg-[#354B35] text-[#F7F3EA]"
                  : "text-[#354B35] hover:bg-[#354B35]/8"
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </Link>
            <Link
              href="/menu"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                pathname === "/menu"
                  ? "bg-[#354B35] text-[#F7F3EA]"
                  : "text-[#354B35] hover:bg-[#354B35]/8"
              }`}
            >
              <div className="flex items-center gap-3">
                <UtensilsCrossed className="w-4 h-4" />
                <span>Explore Full Menu</span>
              </div>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#B99A60] text-white">
                Fresh
              </span>
            </Link>
            <Link
              href="/videos"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                pathname.startsWith("/videos")
                  ? "bg-[#354B35] text-[#F7F3EA]"
                  : "text-[#354B35] hover:bg-[#354B35]/8"
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Video Library & Recipes</span>
            </Link>
            <Link
              href="/#why-choose-us"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[#354B35] hover:bg-[#354B35]/8 transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              <span>Why Bento Babu</span>
            </Link>
            <Link
              href="/#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[#354B35] hover:bg-[#354B35]/8 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              <span>FAQ & Delivery Info</span>
            </Link>
            <Link
              href="/support"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                pathname.startsWith("/support")
                  ? "bg-[#354B35] text-[#F7F3EA]"
                  : "text-[#354B35] hover:bg-[#354B35]/8"
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              <span>Customer Support</span>
            </Link>
          </div>

          {/* Quick Collections Section */}
          {categories.length > 0 && (
            <div className="pt-2 border-t border-[#E8E2D2]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#8C713B] px-1 mb-2">
                Nutritional Collections
              </div>
              <div className="grid grid-cols-2 gap-2">
                {categories.map((c) => (
                  <Link
                    key={c.id}
                    href={`/categories/${c.slug}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2.5 rounded-xl bg-white border border-[#E8E2D2] text-xs font-semibold text-[#222922] hover:border-[#354B35] hover:text-[#354B35] transition-all flex items-center justify-between"
                  >
                    <span className="truncate">{c.name}</span>
                    <ArrowRight className="w-3 h-3 text-[#8A9A86] shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* User Account / Auth Actions */}
          <div className="pt-3 border-t border-[#E8E2D2]">
            {status === "loading" ? (
              <div className="h-10 rounded-xl bg-[#E5DFC5]/40 animate-pulse" />
            ) : status === "authenticated" && user ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-[#E8E2D2]">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#354B35] to-[#4B644B] text-[#DFC89B] flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-xs text-[#222922] truncate">{user.name}</div>
                    <div className="text-[11px] text-[#6B776A] truncate">{user.email}</div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <Link
                    href="/account"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 text-center rounded-xl bg-white border border-[#E8E2D2] text-[11px] font-semibold text-[#354B35] hover:bg-[#F7F3EA]"
                  >
                    Profile
                  </Link>
                  <Link
                    href="/orders"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 text-center rounded-xl bg-white border border-[#E8E2D2] text-[11px] font-semibold text-[#354B35] hover:bg-[#F7F3EA]"
                  >
                    Orders
                  </Link>
                  <Link
                    href="/addresses"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 text-center rounded-xl bg-white border border-[#E8E2D2] text-[11px] font-semibold text-[#354B35] hover:bg-[#F7F3EA]"
                  >
                    Addresses
                  </Link>
                  <Link
                    href="/support"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 text-center rounded-xl bg-white border border-[#E8E2D2] text-[11px] font-semibold text-[#354B35] hover:bg-[#F7F3EA]"
                  >
                    Support
                  </Link>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-50 text-[#C86D51] font-semibold text-xs border border-red-200 hover:bg-red-100 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Link
                  href={loginHref}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-full border border-[#354B35]/40 text-[#354B35] font-semibold text-xs hover:bg-[#354B35]/8 transition-colors"
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </Link>
                <Link
                  href={registerHref}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-full bg-[#354B35] text-[#F7F3EA] font-semibold text-xs hover:bg-[#253525] transition-colors shadow-xs"
                >
                  <span>Sign Up</span>
                  <ArrowRight className="w-3 h-3 text-[#DFC89B]" />
                </Link>
              </div>
            )}
          </div>

          {/* Quick Contact & WhatsApp Support */}
          <div className="pt-2 border-t border-[#E8E2D2] flex items-center justify-between text-xs text-[#6B776A] px-1">
            <a
              href={`tel:${brandConfig.contact.phone.replace(/[^0-9+]/g, "")}`}
              className="flex items-center gap-1.5 hover:text-[#354B35]"
            >
              <Phone className="w-3.5 h-3.5 text-[#B99A60]" />
              <span>{brandConfig.contact.phone}</span>
            </a>
            <a
              href={`https://wa.me/${brandConfig.contact.whatsapp.replace(/[^0-9]/g, "")}?text=Hi,%20I%20have%20a%20question%20about%20my%20order`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-[#354B35] hover:text-[#253525]"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>WhatsApp Us</span>
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
