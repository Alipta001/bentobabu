import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ShieldCheck,
  Lock,
  UserCheck,
  ExternalLink,
  Mail,
  Phone,
  MapPin,
  Globe,
  Database,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy | BentoBabu",
  description:
    "Learn how BentoBabu accesses, uses, stores, and protects information received through Google Sign-In.",
};

export default function GooglePrivacyPolicyPage() {
  const lastUpdated = "November 21, 2026";

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA] text-[#222922]">
      <Header />

      <main className="flex-1 py-10 md:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header Banner */}
          <div className="text-center mb-10 sm:mb-14">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#354B35]/10 text-[#354B35] text-xs font-semibold uppercase tracking-wider mb-4 border border-[#354B35]/20">
              <ShieldCheck className="w-4 h-4 text-[#354B35]" />
              Google API Services User Data Policy
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-[#222922] tracking-tight">
              Privacy Policy
            </h1>
            <p className="mt-3 text-sm sm:text-base text-[#6B776A] max-w-2xl mx-auto">
              How BentoBabu accesses, uses, stores, and protects customer information received through Google Sign-In.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-[#8A9A86]">
              <Calendar className="w-3.5 h-3.5 text-[#B99A60]" />
              <span>Last Updated: {lastUpdated}</span>
            </div>
          </div>

          {/* Limited Use Disclosure Banner (Google Verification Requirement) */}
          <div className="mb-10 p-5 sm:p-6 rounded-2xl bg-[#354B35] text-[#EDE8DE] shadow-md border border-[#243324]">
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-[#243324] text-[#DFC89B] shrink-0 mt-0.5">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Google API Services Limited Use Disclosure
                </h2>
                <p className="text-xs sm:text-sm leading-relaxed text-[#EDE8DE]/90">
                  BentoBabu&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
                  <a
                    href="https://developers.google.com/terms/api-services-user-data-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#DFC89B] underline decoration-[#DFC89B]/50 hover:decoration-[#DFC89B] font-semibold inline-flex items-center gap-1"
                  >
                    Google API Services User Data Policy
                    <ExternalLink className="w-3 h-3 inline" />
                  </a>
                  , including the Limited Use requirements.
                </p>
              </div>
            </div>
          </div>

          {/* Content Card */}
          <div className="bg-white rounded-2xl border border-[#E5DFC5] shadow-sm p-6 sm:p-10 space-y-10">
            {/* 1. Introduction */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  1
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Introduction
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                Welcome to BentoBabu (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;). We operate{" "}
                <Link href="/" className="text-[#354B35] font-medium underline">
                  https://bentobabu.com
                </Link>{" "}
                and associated meal ordering services. We respect your privacy and are committed to protecting any personal data you share with us.
              </p>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                This Privacy Policy outlines our specific practices regarding the collection, use, retention, and protection of user data received through Google Identity Services (Google Sign-In). When you choose to register or sign in to BentoBabu using your Google Account, this policy governs how that information is handled.
              </p>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 2. Google Account Information We Access */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  2
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Google Account Information We Access
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                When you initiate Google Sign-In or Google Sign-Up on BentoBabu, we request access exclusively to basic, non-sensitive profile information using standard OpenID Connect scopes (<code className="px-1.5 py-0.5 rounded bg-[#F7F3EA] text-xs font-mono text-[#354B35]">openid</code>, <code className="px-1.5 py-0.5 rounded bg-[#F7F3EA] text-xs font-mono text-[#354B35]">email</code>, <code className="px-1.5 py-0.5 rounded bg-[#F7F3EA] text-xs font-mono text-[#354B35]">profile</code>). Specifically, we access:
              </p>
              <ul className="space-y-2.5 text-sm sm:text-base text-[#4A554A] pl-1">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Google Account Identifier (<code className="text-xs font-mono">sub</code>):</strong> A unique, pseudonymous string that identifies your Google account for authentication.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Email Address:</strong> Your primary Google account email address and its verification status (<code className="text-xs font-mono">email_verified: true</code>).
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Full Name:</strong> Your display name (given name and family name) as configured in your Google profile.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Profile Picture:</strong> The URL of your publicly available Google profile avatar.
                  </span>
                </li>
              </ul>
              <div className="p-4 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs sm:text-sm text-[#4A554A]">
                <strong className="text-[#222922]">Scopes We Never Request:</strong> BentoBabu does not request, read, or access your Google Drive files, Gmail messages, Google Contacts, Google Calendar, location history, financial accounts, or any restricted Google API data.
              </div>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 3. How We Use Google User Data */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  3
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  How We Use Google User Data
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                We strictly limit the use of data obtained through Google APIs to providing, personalizing, and improving our customer ordering services:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="p-4 rounded-xl bg-[#F7F3EA]/60 border border-[#E5DFC5] space-y-1.5">
                  <div className="flex items-center gap-2 text-[#354B35] font-semibold text-sm">
                    <UserCheck className="w-4 h-4" />
                    <span>Customer Authentication</span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#4A554A]">
                    Verifying your identity securely so you can log into BentoBabu seamlessly without remembering a separate password.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#F7F3EA]/60 border border-[#E5DFC5] space-y-1.5">
                  <div className="flex items-center gap-2 text-[#354B35] font-semibold text-sm">
                    <Database className="w-4 h-4" />
                    <span>Account Creation</span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#4A554A]">
                    Automatically provisioning a customer profile upon your first sign-in using your name and verified email.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#F7F3EA]/60 border border-[#E5DFC5] space-y-1.5">
                  <div className="flex items-center gap-2 text-[#354B35] font-semibold text-sm">
                    <Mail className="w-4 h-4" />
                    <span>Order Notifications</span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#4A554A]">
                    Dispatching transactional order receipts, preparation alerts, delivery tracking links, and customer support communications.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#F7F3EA]/60 border border-[#E5DFC5] space-y-1.5">
                  <div className="flex items-center gap-2 text-[#354B35] font-semibold text-sm">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Security & Fraud Prevention</span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#4A554A]">
                    Protecting customer accounts from unauthorized access, credential stuffing, and duplicate registrations.
                  </p>
                </div>
              </div>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 4. How We Share Google User Data */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  4
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  How We Share Google User Data
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                <strong className="text-[#222922]">We never sell your Google data.</strong> BentoBabu will never sell, lease, rent, trade, or monetize your Google account information or personal data to third-party advertisers, data brokers, or marketing networks under any circumstance.
              </p>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                We only share minimal customer information under the following strictly defined conditions:
              </p>
              <ul className="space-y-2 text-sm sm:text-base text-[#4A554A] pl-1">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Essential Service Providers:</strong> Trusted infrastructure and transactional communication partners (e.g., secure cloud hosting, transactional email delivery) who process information on our behalf under confidentiality and security agreements.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Legal & Regulatory Obligations:</strong> Only when strictly required by applicable law, court order, subpoena, or lawful government regulation.
                  </span>
                </li>
              </ul>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 5. Storage and Protection */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  5
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Storage and Protection
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                We implement comprehensive security measures designed to safeguard your information against unauthorized access, disclosure, alteration, and destruction:
              </p>
              <ul className="space-y-2 text-sm sm:text-base text-[#4A554A] pl-1">
                <li className="flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">End-to-End Encryption:</strong> All communications between your browser, Google identity endpoints, and BentoBabu servers are encrypted using modern Transport Layer Security (TLS 1.2+ / TLS 1.3).
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">Cryptographic Verification:</strong> Google ID tokens are verified server-side using Google&apos;s official cryptographic libraries. We never store raw Google ID tokens or credentials.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-[#354B35] shrink-0 mt-1" />
                  <span>
                    <strong className="text-[#222922]">HttpOnly Session Cookies:</strong> Customer authentication sessions are preserved with encrypted, HttpOnly, SameSite cookies to protect against cross-site scripting (XSS) and unauthorized session extraction.
                  </span>
                </li>
              </ul>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 6. Data Retention and Deletion */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  6
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Data Retention and Deletion
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                We retain your account details only for as long as your BentoBabu account remains active or as needed to provide you with order services, resolve disputes, and comply with legal or accounting requirements.
              </p>
              <div className="p-4 sm:p-5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] space-y-2">
                <div className="flex items-center gap-2 text-[#354B35] font-semibold text-sm">
                  <Trash2 className="w-4 h-4 text-[#354B35]" />
                  <span>How to Request Data Deletion</span>
                </div>
                <p className="text-xs sm:text-sm text-[#4A554A] leading-relaxed">
                  You have the right to request the complete deletion of your BentoBabu account and all associated Google user data at any time. To request deletion, please contact our support team at{" "}
                  <a
                    href="mailto:bentobabuofficial@gmail.com?subject=Data%20Deletion%20Request"
                    className="text-[#354B35] font-semibold underline"
                  >
                    bentobabuofficial@gmail.com
                  </a>{" "}
                  with the subject line &quot;Data Deletion Request&quot;. Upon verifying account ownership, your profile, Google identifier link, and personal records will be permanently purged from our active systems within thirty (30) days.
                </p>
              </div>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 7. User Choices and Permissions */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  7
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  User Choices and Permissions
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                You maintain complete control over the permissions granted to BentoBabu. You can review, manage, or revoke BentoBabu&apos;s access to your Google Account at any time directly through Google&apos;s security dashboard:
              </p>
              <div className="pt-1">
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#354B35] text-white text-xs sm:text-sm font-semibold hover:bg-[#243324] transition-colors shadow-sm"
                >
                  <span>Manage Google Third-Party Permissions</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              <p className="text-xs sm:text-sm text-[#6B776A]">
                Revoking access disconnects your Google Account from future BentoBabu sign-ins. If you disconnect, you can reconnect at any time or continue using alternative authentication methods.
              </p>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 8. Limited Use Disclosure */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  8
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Limited Use Disclosure
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                BentoBabu strictly adheres to Google&apos;s developer requirements for handling user data:
              </p>
              <div className="p-4 sm:p-5 rounded-xl bg-[#F7F3EA] border-l-4 border-l-[#B99A60] border border-[#E5DFC5] space-y-2">
                <p className="text-xs sm:text-sm font-medium text-[#222922] italic leading-relaxed">
                  &quot;BentoBabu&apos;s use and transfer to any other app of information received from Google APIs will adhere to{" "}
                  <a
                    href="https://developers.google.com/terms/api-services-user-data-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#354B35] underline font-bold inline-flex items-center gap-1"
                  >
                    Google API Services User Data Policy
                    <ExternalLink className="w-3 h-3 inline" />
                  </a>
                  , including the Limited Use requirements.&quot;
                </p>
              </div>
              <p className="text-xs sm:text-sm text-[#4A554A] leading-relaxed">
                Specifically:
              </p>
              <ul className="space-y-1.5 text-xs sm:text-sm text-[#4A554A] pl-1">
                <li>• We do not use Google user data for advertising purposes or transfer it to ad platforms.</li>
                <li>• We do not allow humans to read user data unless required by law, necessary for security purposes, or with your explicit consent to resolve a support inquiry.</li>
                <li>• We do not use Google user data to train, fine-tune, or develop generalized machine learning or artificial intelligence models.</li>
              </ul>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 9. Children's Privacy */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  9
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Children&apos;s Privacy
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                Our services and Google authentication features are not directed to children under the age of 13 (or under 18 without parental consent). We do not knowingly collect or solicit personal information from minors. If you believe that a child has provided us with personal information through Google Sign-In, please contact us immediately, and we will take immediate steps to delete the information from our systems.
              </p>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 10. Changes to This Policy */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  10
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Changes to This Policy
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                We may periodically update this Google User Data Privacy Policy to reflect modifications in our service, regulatory updates, or changes to Google&apos;s policies. When changes are made, we will update the &quot;Last Updated&quot; date at the top of this document. Continued use of BentoBabu after any changes signifies your acceptance of the updated policy.
              </p>
            </section>

            <hr className="border-[#E5DFC5]" />

            {/* 11. Contact Information */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#354B35] font-serif font-bold text-sm flex items-center justify-center border border-[#E5DFC5]">
                  11
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Contact Information
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#4A554A] leading-relaxed">
                If you have questions, comments, or data privacy requests concerning this policy or BentoBabu&apos;s privacy practices, please contact us using the details below:
              </p>
              <div className="p-5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] space-y-3 text-xs sm:text-sm text-[#4A554A]">
                <div className="flex items-center gap-3">
                  <div className="font-semibold text-[#222922] w-24">Brand:</div>
                  <div className="font-medium text-[#222922]">BentoBabu</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-semibold text-[#222922] w-24">Email:</div>
                  <a
                    href="mailto:bentobabuofficial@gmail.com"
                    className="text-[#354B35] font-semibold underline"
                  >
                    bentobabuofficial@gmail.com
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-semibold text-[#222922] w-24">Phone:</div>
                  <a
                    href="tel:+918584085669"
                    className="text-[#354B35] font-medium"
                  >
                    +91 8584085669
                  </a>
                </div>
                <div className="flex items-start gap-3">
                  <div className="font-semibold text-[#222922] w-24 shrink-0">Address:</div>
                  <div>Chandanpukur (Nonachandanpur) Bazar, Barrackpore, West Bengal – 700122, India.</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-semibold text-[#222922] w-24">Website:</div>
                  <a
                    href="https://bentobabu.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#354B35] font-semibold underline inline-flex items-center gap-1"
                  >
                    https://bentobabu.com
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
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
