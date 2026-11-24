import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  FileText,
  ShieldCheck,
  CreditCard,
  Truck,
  RotateCcw,
  AlertTriangle,
  Scale,
  Ban,
  HelpCircle,
  Calendar,
  ExternalLink,
  Utensils,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BrandContactCard, BrandSupportHelplineText } from "@/components/common/BrandContactCard";

export const metadata: Metadata = {
  title: "Terms of Service | BentoBabu",
  description:
    "Read the Terms of Service governing the use of BentoBabu's website, food ordering, payments, and delivery services.",
};

export default function TermsOfServicePage() {
  const lastUpdated = "November 21, 2026";

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA] text-[#222922]">
      <Header />

      <main className="flex-1 py-10 md:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header Banner */}
          <div className="text-center mb-10 sm:mb-14">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#354B35]/10 text-[#354B35] text-xs font-semibold uppercase tracking-wider mb-4 border border-[#354B35]/20">
              <FileText className="w-4 h-4 text-[#354B35]" />
              Customer Agreement
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-[#222922] tracking-tight">
              Terms of Service
            </h1>
            <p className="mt-3 text-sm sm:text-base text-[#6B776A] max-w-2xl mx-auto">
              Please read these Terms of Service carefully before ordering meals or accessing our platform.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-[#8A9A86]">
              <Calendar className="w-3.5 h-3.5 text-[#B99A60]" />
              <span>Last Updated: {lastUpdated}</span>
            </div>
          </div>

          {/* Quick Notice Card */}
          <div className="mb-10 p-5 sm:p-6 rounded-2xl bg-[#354B35] text-[#EDE8DE] shadow-md border border-[#243324]">
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-[#243324] text-[#DFC89B] shrink-0 mt-0.5">
                <Scale className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Welcome to BentoBabu
                </h2>
                <p className="text-xs sm:text-sm leading-relaxed text-[#EDE8DE]/90">
                  By accessing our website (https://bentobabu.com) or placing an order for freshly prepared meals, you enter into a legally binding agreement governed by these Terms of Service and applicable laws of India. If you do not agree with any part of these terms, please refrain from using our services.
                </p>
              </div>
            </div>
          </div>

          {/* Main Legal Content Container */}
          <div className="bg-white rounded-2xl border border-[#E5DFC5] shadow-sm p-6 sm:p-10 space-y-10">
            {/* 1. Introduction and Acceptance */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  1
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Introduction and Acceptance
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                These Terms of Service (&quot;Terms&quot;) constitute a legally binding contract between you (&quot;Customer&quot;, &quot;User&quot;, &quot;you&quot;) and BentoBabu (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;), governing your access to and use of our website, mobile interfaces, meal ordering, and delivery services.
              </p>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                By browsing our site, registering an account, or placing an order for food items, you acknowledge that you have read, understood, and agreed to be bound by these Terms, along with our{" "}
                <Link
                  href="/google-privacy-policy"
                  className="text-[#354B35] font-semibold underline"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 2. About BentoBabu */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  2
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  About BentoBabu
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                BentoBabu is an online food ordering and culinary service operating in India. We curate, prepare, and deliver chef-crafted meals, nutritious balanced bowls, and healthy food selections prepared daily using fresh ingredients.
              </p>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                Our kitchen operations are based out of Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal – 700122, serving customers across designated operational delivery zones in and around the Barrackpore region.
              </p>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 3. Eligibility and User Accounts */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  3
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Eligibility and User Accounts
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                To create an account and place orders through BentoBabu, you must satisfy the following criteria:
              </p>
              <ul className="space-y-2 text-sm sm:text-base text-[#4A554A] pl-1">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Legal Capacity:</strong> You must be at least 18 years of age or accessing our service under the direct supervision and consent of a parent or legal guardian capable of entering into binding contracts under the Indian Contract Act, 1872.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Accurate Information:</strong> When registering via email/password or Google Sign-In, you agree to provide truthful, accurate, and current information, including your full name, valid email address, phone number, and delivery coordinates.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Account Confidentiality:</strong> You are responsible for safeguarding your login credentials. Any activity or order originating from your authenticated account or session will be deemed authorized by you. If you suspect unauthorized access, notify us immediately.
                  </span>
                </li>
              </ul>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 4. Ordering Process */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  4
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Ordering Process
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                When placing an order on BentoBabu:
              </p>
              <ul className="space-y-2 text-sm sm:text-base text-[#4A554A] pl-1">
                <li className="flex items-start gap-2.5">
                  <Utensils className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Menu Availability &amp; Descriptions:</strong> All items listed on the website are subject to daily kitchen capacity and fresh ingredient availability. While we make every effort to display accurate images, descriptions, and portion details, actual presentations may vary slightly.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Utensils className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Order Confirmation:</strong> An order constitutes an offer to purchase. An order is confirmed only when assigned an official BentoBabu Order Number (e.g. BB-XXXX) and updated to &quot;CONFIRMED&quot; status in your account dashboard.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Utensils className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Item Unavailability:</strong> In rare cases where a selected ingredient or meal becomes unavailable after order placement, we will contact you to propose an equivalent substitute or cancel the affected item with an appropriate refund or bill adjustment.
                  </span>
                </li>
              </ul>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 5. Pricing and Payments */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  5
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Pricing and Payments
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                All prices are stated in Indian Rupees (₹ / INR). The final bill displayed at checkout includes:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="p-4 rounded-xl bg-[#F7F3EA]/60 border border-[#E5DFC5] space-y-1">
                  <div className="flex items-center gap-2 text-[#354B35] font-semibold text-sm">
                    <CreditCard className="w-4 h-4" />
                    <span>Item Total &amp; Applicable Charges</span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#4A554A]">
                    Prices for items ordered, distance-based delivery charges, applicable taxes, and any valid discount coupons applied before final checkout.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#F7F3EA]/60 border border-[#E5DFC5] space-y-1">
                  <div className="flex items-center gap-2 text-[#354B35] font-semibold text-sm">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Supported Payment Methods</span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#4A554A]">
                    We accept payments via <strong>Razorpay Online</strong> (Cards, UPI, Netbanking) and <strong>Cash / UPI on Delivery (COD)</strong> upon delivery partner arrival.
                  </p>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-[#6B776A] leading-relaxed">
                Online payment transactions are processed securely by Razorpay. BentoBabu never collects or stores your card numbers, CVVs, or bank netbanking passwords.
              </p>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 6. Order Cancellation and Modification */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  6
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Order Cancellation and Modification
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                Due to the perishable nature of freshly prepared meals, cancellations and modifications are strictly governed by the operational stage of your order:
              </p>
              <ul className="space-y-2 text-sm sm:text-base text-[#4A554A] pl-1">
                <li className="flex items-start gap-2.5">
                  <RotateCcw className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Self-Cancellation Window:</strong> You may cancel an unpaid or cash-on-delivery order through your account dashboard only while it remains in <em>&quot;PENDING&quot;</em> or <em>&quot;CONFIRMED&quot;</em> status, before culinary preparation commences.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <RotateCcw className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Preparation &amp; Dispatch Cut-Off:</strong> Once an order status transitions to <em>&quot;PREPARING&quot;</em>, <em>&quot;READY_FOR_PICKUP&quot;</em>, or <em>&quot;OUT_FOR_DELIVERY&quot;</em>, ingredients have been committed and cooked. At this stage, self-cancellation is strictly disabled.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <RotateCcw className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Paid Orders:</strong> If you paid online via Razorpay and need to request cancellation before preparation, please contact Customer Support immediately (<BrandSupportHelplineText />) for verification and refund processing.
                  </span>
                </li>
              </ul>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 7. Refunds */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  7
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Refunds
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                Eligible refunds are handled strictly in accordance with BentoBabu&apos;s refund procedures and our payment partner&apos;s settlement timelines:
              </p>
              <ul className="space-y-2 text-sm sm:text-base text-[#4A554A] pl-1">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Eligible Grounds:</strong> Refunds may be granted in instances of confirmed kitchen non-fulfillment, pre-preparation cancellation approved by support, or failure of delivery attributable solely to BentoBabu.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Payment Method Reversal:</strong> Approved refunds for online transactions are credited directly to the original payment source (bank account, card, or UPI VPA) through Razorpay. Cash-on-delivery orders cancelled prior to preparation require no refund as no funds were collected.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Processing Time:</strong> Once initiated by BentoBabu, bank and payment network settlement typically takes 5 to 7 standard business days depending on your issuing bank. BentoBabu does not guarantee instant account credits.
                  </span>
                </li>
              </ul>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 8. Food Quality, Allergens and Dietary Information */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  8
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Food Quality, Allergens and Dietary Information
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                We take immense pride in preparing wholesome, fresh food with zero artificial preservatives. However, customers must note the following important dietary guidelines:
              </p>
              <div className="p-4 sm:p-5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] space-y-2">
                <div className="flex items-center gap-2 text-[#222922] font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4 text-[#B99A60]" />
                  <span>Allergen Notice</span>
                </div>
                <p className="text-xs sm:text-sm text-[#4A554A] leading-relaxed">
                  Our commercial kitchen prepares dishes containing various ingredients, including dairy, gluten, nuts, soy, and eggs. While we follow strict hygiene standards, we operate a shared culinary facility and cannot guarantee an entirely allergen-free environment. Customers with severe or life-threatening food allergies are advised to exercise caution and communicate with our team prior to ordering.
                </p>
              </div>
              <p className="text-xs sm:text-sm text-[#4A554A]">
                Meals are intended for prompt consumption upon delivery. BentoBabu is not liable for food degradation resulting from prolonged storage, reheating, or improper handling after successful handover.
              </p>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 9. Delivery */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  9
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Delivery
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                Our food delivery services operate under the following parameters:
              </p>
              <ul className="space-y-2 text-sm sm:text-base text-[#4A554A] pl-1">
                <li className="flex items-start gap-2.5">
                  <Truck className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Serviceable Areas &amp; Slots:</strong> Delivery is provided strictly within our defined geographic zones in Barrackpore and surrounding areas. Orders must be scheduled within active kitchen delivery slots.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Truck className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Address Accuracy &amp; Reachability:</strong> You must supply an exact address, reachable landmark, and an active phone number. Delivery partners will attempt contact upon arrival at your destination.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Truck className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Delivery Time Estimates:</strong> Displayed delivery times and slot estimates are approximations. Actual delivery may be impacted by traffic conditions, severe weather, roadblocks, or circumstances beyond our reasonable control.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Truck className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Unsuccessful Delivery:</strong> If a delivery cannot be completed due to incorrect address information, refusal to accept food, or an unreachable recipient after repeated attempts, the order will be treated as fulfilled and no refund will be issued for cooked perishable goods.
                  </span>
                </li>
              </ul>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 10. Customer Responsibilities and Prohibited Activities */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  10
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Customer Responsibilities and Prohibited Activities
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                When interacting with BentoBabu, our delivery personnel, and our digital platforms, you agree not to engage in any of the following prohibited behaviors:
              </p>
              <ul className="space-y-2 text-xs sm:text-sm text-[#4A554A] pl-1">
                <li>• Submitting false, fraudulent, or speculative meal orders.</li>
                <li>• Supplying fake contact numbers, stolen credit credentials, or unauthorized payment instruments.</li>
                <li>• Harassing, abusing, or mistreating delivery partners, kitchen staff, or customer support representatives.</li>
                <li>• Attempting to disrupt, probe, reverse-engineer, or impair the security or infrastructure of bentobabu.com.</li>
                <li>• Creating multiple accounts to exploit promotional discounts, referral credits, or coupons unlawfully.</li>
              </ul>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 11. Third-Party Services */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  11
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Third-Party Services
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                BentoBabu integrates trusted third-party providers to deliver essential platform features, including:
              </p>
              <ul className="space-y-1.5 text-xs sm:text-sm text-[#4A554A] pl-1">
                <li>• <strong>Razorpay:</strong> Secure payment processing and transaction verification.</li>
                <li>• <strong>Google Identity Services:</strong> Customer authentication and sign-in verification.</li>
                <li>• <strong>Mapping &amp; Cloud Services:</strong> Geocoding, map routing, and secure cloud storage.</li>
              </ul>
              <p className="text-xs sm:text-sm text-[#6B776A] leading-relaxed">
                Your use of these third-party features is subject to the respective terms and privacy policies of those independent providers.
              </p>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 12. Intellectual Property */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  12
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Intellectual Property
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                All brand names, trade marks, logos (&quot;BentoBabu&quot;), culinary descriptions, meal photographs, layout designs, software source code, graphics, and textual materials published on bentobabu.com are the exclusive intellectual property of BentoBabu or its content licensors. You may not copy, reproduce, republish, distribute, or create derivative works without prior written authorization.
              </p>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 13. Limitation of Liability */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  13
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Limitation of Liability
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                To the maximum extent permissible under applicable Indian law, including the Consumer Protection Act, 2019 and the Information Technology Act, 2000:
              </p>
              <ul className="space-y-2 text-xs sm:text-sm text-[#4A554A] pl-1">
                <li>• BentoBabu provides the website and ordering platform on an &quot;as is&quot; and &quot;as available&quot; basis without warranties of uninterrupted uptime or error-free operation.</li>
                <li>• In no event shall BentoBabu, its operators, or staff be liable for indirect, incidental, punitive, or consequential damages arising from service usage, food delivery delays due to force majeure, or website downtime.</li>
                <li>• BentoBabu&apos;s aggregate liability for any direct claim arising out of or related to an order placed through the platform shall not exceed the actual monetary amount received by BentoBabu for that specific order.</li>
                <li>• Nothing in these Terms shall limit or exclude liability that cannot lawfully be excluded under Indian consumer protection or food safety statutes.</li>
              </ul>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 14. Suspension and Termination */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  14
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Suspension and Termination
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                We reserve the right to temporarily restrict, suspend, or permanently terminate your customer account or access to the platform without prior notice if we determine, in our reasonable discretion, that you have violated these Terms, engaged in fraudulent activities, repeatedly refused lawful delivery of cash-on-delivery orders, or exhibited abusive conduct toward our team.
              </p>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 15. Privacy */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  15
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Privacy
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                Your privacy is paramount to us. The collection, processing, and protection of your personal information (including data collected during registration or through Google Sign-In) is strictly governed by our{" "}
                <Link
                  href="/google-privacy-policy"
                  className="text-[#354B35] font-semibold underline inline-flex items-center gap-1"
                >
                  Google API &amp; Customer Privacy Policy
                  <ExternalLink className="w-3.5 h-3.5 inline" />
                </Link>
                . Please review our Privacy Policy to understand our data protection standards.
              </p>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 16. Changes to These Terms */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  16
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Changes to These Terms
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                We may revise and update these Terms from time to time to accommodate changes in our operational procedures, menu offerings, technology, or legal requirements. When updates are published, the revised date at the top of this page will be updated. Your continued use of BentoBabu after any updates constitutes your acceptance of the revised terms.
              </p>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 17. Governing Law and Disputes */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  17
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Governing Law and Disputes
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                These Terms and any contractual disputes or claims arising out of or in connection with your use of BentoBabu shall be governed by and construed in accordance with the laws of the Republic of India.
              </p>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                Any legal action, suit, or proceeding arising under or in connection with these Terms shall be subject to the exclusive jurisdiction of the competent courts having jurisdiction over Barrackpore / North 24 Parganas, West Bengal, India.
              </p>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 18. Contact Information */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  18
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Contact Information
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                For questions, clarifications, order assistance, or feedback regarding these Terms of Service, please reach out to our team:
              </p>
              <BrandContactCard labelWidth="w-28" showWebsite={true} showPrivacyPolicy={true} />
            </section>
          </div>

          {/* Navigation Back */}
          <div className="mt-8 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#354B35] hover:text-[#243324] underline transition-colors"
            >
              ← Back to BentoBabu Home
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
