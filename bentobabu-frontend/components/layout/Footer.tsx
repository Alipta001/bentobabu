import React from "react";
import Link from "next/link";
import {
  Heart,
  ShieldCheck,
  Leaf,
  Clock,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";
import { brandConfig } from "@/config/brand";
import { INITIAL_CATEGORIES } from "@/lib/data/categories";

export function Footer() {
  return (
    <footer className="bg-[#243324] text-[#EDE8DE] pt-16 pb-12 border-t border-[#354B35]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Quality Badges */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pb-12 mb-12 border-b border-[#354B35]/60 text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-2xl bg-[#354B35] flex items-center justify-center text-[#B99A60]">
              <Leaf className="w-6 h-6" />
            </div>
            <div className="font-semibold text-white text-sm">Farm-Fresh & Clean</div>
            <div className="text-xs text-[#B5C4B1] max-w-[200px]">
              Procured daily from certified regional farmers with zero preservatives.
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-2xl bg-[#354B35] flex items-center justify-center text-[#B99A60]">
              <Heart className="w-6 h-6" />
            </div>
            <div className="font-semibold text-white text-sm">Nutrition-First Recipes</div>
            <div className="text-xs text-[#B5C4B1] max-w-[200px]">
              Balanced macronutrients calibrated by certified clinical nutritionists.
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-2xl bg-[#354B35] flex items-center justify-center text-[#B99A60]">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="font-semibold text-white text-sm">Gourmet Hygiene</div>
            <div className="text-xs text-[#B5C4B1] max-w-[200px]">
              FSSAI compliant sterile kitchen with daily hygiene audits.
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-2xl bg-[#354B35] flex items-center justify-center text-[#B99A60]">
              <Clock className="w-6 h-6" />
            </div>
            <div className="font-semibold text-white text-sm">Punctual Fresh Delivery</div>
            <div className="text-xs text-[#B5C4B1] max-w-[200px]">
              Insulated temperature-retaining meal bentos delivered in 35-45 minutes.
            </div>
          </div>
        </div>

        {/* Main Links Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-[#354B35]/60">
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#354B35] flex items-center justify-center text-[#B99A60] font-serif text-xl font-bold">
                B
              </div>
              <span className="font-serif text-2xl font-bold tracking-tight text-white">
                {brandConfig.name}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-[#B5C4B1] max-w-sm">
              {brandConfig.description}
            </p>
            <div className="flex items-center gap-3 pt-2 text-[#B99A60]">
              <a
                href={brandConfig.social.instagram}
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full bg-[#354B35] flex items-center justify-center hover:bg-[#B99A60] hover:text-[#243324] transition-colors"
                aria-label="Instagram"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </a>
              <a
                href={brandConfig.social.facebook}
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full bg-[#354B35] flex items-center justify-center hover:bg-[#B99A60] hover:text-[#243324] transition-colors"
                aria-label="Facebook"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M9 8H6v4h3v12h5V12h3.642L18 8h-4V6.333C14 5.374 14.5 5 15.5 5H18V0h-3.808C10.595 0 9 1.583 9 4.615V8z"/>
                </svg>
              </a>
              <a
                href={brandConfig.social.twitter}
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full bg-[#354B35] flex items-center justify-center hover:bg-[#B99A60] hover:text-[#243324] transition-colors"
                aria-label="Twitter"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              <a
                href={brandConfig.social.linkedin}
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full bg-[#354B35] flex items-center justify-center hover:bg-[#B99A60] hover:text-[#243324] transition-colors"
                aria-label="LinkedIn"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#DFC89B]">
              Explore
            </h3>
            <ul className="space-y-2 text-xs text-[#EDE8DE]/80">
              <li>
                <Link href="/" className="hover:text-white transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/menu" className="hover:text-white transition-colors">
                  Full Menu
                </Link>
              </li>
              <li>
                <Link href="/videos" className="hover:text-white transition-colors">
                  Videos & Recipes
                </Link>
              </li>
              <li>
                <Link href="/cart" className="hover:text-white transition-colors">
                  Cart & Checkout
                </Link>
              </li>
              <li>
                <Link href="/account" className="hover:text-white transition-colors">
                  My Orders & Account
                </Link>
              </li>
              <li>
                <Link href="/#why-choose-us" className="hover:text-white transition-colors">
                  Our Philosophy
                </Link>
              </li>
            </ul>
          </div>

          {/* Target Collections */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#DFC89B]">
              Collections
            </h3>
            <ul className="space-y-2 text-xs text-[#EDE8DE]/80">
              {INITIAL_CATEGORIES.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/categories/${c.slug}`}
                    className="hover:text-white transition-colors"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Details */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#DFC89B]">
              Kitchen & Contact
            </h3>
            <ul className="space-y-2.5 text-xs text-[#EDE8DE]/80">
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#B99A60] shrink-0 mt-0.5" />
                <span>{brandConfig.contact.address}</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#B99A60] shrink-0" />
                <span>{brandConfig.contact.phone}</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#B99A60] shrink-0" />
                <span>{brandConfig.contact.email}</span>
              </li>
              <li className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#B99A60] shrink-0" />
                <span>{brandConfig.contact.operatingHours}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-[#8A9A86] gap-4">
          <div>
            &copy; {new Date().getFullYear()} {brandConfig.name}. All rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>FSSAI License No. 11223344000123</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
