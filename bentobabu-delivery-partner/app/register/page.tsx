"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bike,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Upload,
  FileText,
  User,
  MapPin,
  FileCheck,
  Phone,
  Mail,
  Lock,
  Calendar,
  Sparkles,
  Copy,
  Check,
  Clock,
  Car,
} from "lucide-react";
import { toast } from "sonner";
import { onboardingApi } from "@/lib/api/onboarding.api";
import {
  DeliveryVehicleType,
  DocumentItem,
  DeliveryApplicationPersonalInfo,
  DeliveryApplicationAddress,
  DeliveryApplicationVehicleInfo,
} from "@/types";

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Tamil Nadu",
  "Telangana",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

const STEPS = [
  { id: 1, label: "Personal", icon: User },
  { id: 2, label: "Address", icon: MapPin },
  { id: 3, label: "Vehicle", icon: Bike },
  { id: 4, label: "Documents", icon: FileText },
  { id: 5, label: "Review", icon: FileCheck },
];

export default function RegisterPage() {
  const router = useRouter();

  // Wizard Step
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success State
  const [submittedAppNumber, setSubmittedAppNumber] = useState<string | null>(null);
  const [hasCopiedAppNumber, setHasCopiedAppNumber] = useState(false);

  // Step 1: Personal Info & Phone OTP
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE" | "OTHER">("MALE");

  // OTP State
  const [otpSent, setOtpSent] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [emailVerificationToken, setEmailVerificationToken] = useState<string | null>(null);
  const [otpCooldown, setOtpCooldown] = useState(0);

  // Step 2: Address
  const [houseNo, setHouseNo] = useState("");
  const [street, setStreet] = useState("");
  const [landmark, setLandmark] = useState("");
  const [city, setCity] = useState("Barrackpore");
  const [state, setState] = useState("West Bengal");
  const [pincode, setPincode] = useState("");

  // Step 3: Vehicle Info
  const [vehicleType, setVehicleType] = useState<DeliveryVehicleType>("MOTORCYCLE");
  const [vehicleBrand, setVehicleBrand] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [drivingLicenseNumber, setDrivingLicenseNumber] = useState("");

  // Step 4: Documents
  const [idType, setIdType] = useState<"AADHAAR" | "PAN" | "VOTER_ID">("AADHAAR");
  const [profilePhotoDoc, setProfilePhotoDoc] = useState<DocumentItem | null>(null);
  const [idProofDoc, setIdProofDoc] = useState<DocumentItem | null>(null);
  const [drivingLicenseDoc, setDrivingLicenseDoc] = useState<DocumentItem | null>(null);
  const [rcDoc, setRcDoc] = useState<DocumentItem | null>(null);
  const [insuranceDoc, setInsuranceDoc] = useState<DocumentItem | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);

  // Step 5: Terms
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeAuthenticity, setAgreeAuthenticity] = useState(false);

  // OTP Cooldown timer
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setTimeout(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearTimeout(timer);
  }, [otpCooldown]);

  // Handler: Send OTP to Email
  const handleSendOtp = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      toast.error("Please enter a valid email address first.");
      return;
    }

    try {
      setIsSendingOtp(true);
      const res = await onboardingApi.sendOtp(cleanEmail);
      setChallengeToken(res.challengeToken);
      setOtpSent(true);
      setOtpCooldown(60);
      toast.success("Verification code sent to your email address.");
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Failed to send verification code.";
      toast.error(msg);
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Handler: Verify Email OTP
  const handleVerifyOtp = async () => {
    if (!challengeToken) {
      toast.error("Please send a verification code first.");
      return;
    }
    if (!otpValue || otpValue.trim().length !== 6) {
      toast.error("Please enter the 6-digit verification code.");
      return;
    }

    try {
      setIsVerifyingOtp(true);
      const res = await onboardingApi.verifyOtp(challengeToken, otpValue.trim());
      if (res.verified) {
        setIsEmailVerified(true);
        setEmailVerificationToken(res.emailVerificationToken);
        toast.success("Email address verified successfully!");
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Verification failed. Check your OTP.";
      toast.error(msg);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Handler: File Upload to Cloudinary
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    category: "profilePhoto" | "idProof" | "drivingLicense" | "rc" | "insurance"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size exceeds 10MB limit. Please upload a smaller document.");
      return;
    }

    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedMimes.includes(file.type)) {
      toast.error("Only JPG, PNG, WEBP, and PDF documents are supported.");
      return;
    }

    try {
      setUploadingCategory(category);
      const uploaded = await onboardingApi.uploadDocument(file, category);

      if (category === "profilePhoto") setProfilePhotoDoc(uploaded);
      else if (category === "idProof") setIdProofDoc(uploaded);
      else if (category === "drivingLicense") setDrivingLicenseDoc(uploaded);
      else if (category === "rc") setRcDoc(uploaded);
      else if (category === "insurance") setInsuranceDoc(uploaded);

      toast.success(`${file.name} uploaded successfully.`);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Document upload failed.";
      toast.error(msg);
    } finally {
      setUploadingCategory(null);
    }
  };

  // Validation per step
  const validateStep1 = () => {
    if (!fullName.trim()) {
      toast.error("Please enter your full name.");
      return false;
    }
    const cleanDigits = phone.replace(/\D/g, "");
    if (cleanDigits.length !== 10 || !/^\d{10}$/.test(cleanDigits)) {
      toast.error("Please enter a valid 10-digit Indian mobile number.");
      return false;
    }
    if (!isEmailVerified) {
      toast.error("Please verify your email address with the verification code.");
      return false;
    }
    if (!password || password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return false;
    }
    if (!dateOfBirth) {
      toast.error("Please select your date of birth.");
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!houseNo.trim()) {
      toast.error("Please enter house/flat/building number.");
      return false;
    }
    if (!street.trim()) {
      toast.error("Please enter street/area name.");
      return false;
    }
    if (!city.trim()) {
      toast.error("Please enter city.");
      return false;
    }
    if (!state.trim()) {
      toast.error("Please select state.");
      return false;
    }
    if (!pincode.trim() || !/^\d{6}$/.test(pincode.trim())) {
      toast.error("Please enter a valid 6-digit PIN code.");
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if (vehicleType !== "BICYCLE") {
      if (!registrationNumber.trim()) {
        toast.error("Vehicle registration number is required for motorized vehicles.");
        return false;
      }
      if (!drivingLicenseNumber.trim()) {
        toast.error("Driving license number is required for motorized vehicles.");
        return false;
      }
    }
    return true;
  };

  const validateStep4 = () => {
    if (!profilePhotoDoc) {
      toast.error("Please upload a clear profile photo.");
      return false;
    }
    if (!idProofDoc) {
      toast.error("Please upload your government ID proof.");
      return false;
    }
    if (vehicleType !== "BICYCLE" && !drivingLicenseDoc) {
      toast.error("Driving license upload is required for motorized vehicles.");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (currentStep === 1 && !validateStep1()) return;
    if (currentStep === 2 && !validateStep2()) return;
    if (currentStep === 3 && !validateStep3()) return;
    if (currentStep === 4 && !validateStep4()) return;

    setCurrentStep((prev) => Math.min(5, prev + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Submit Application
  const handleSubmitApplication = async () => {
    if (!agreeTerms || !agreeAuthenticity) {
      toast.error("Please accept the terms and document authenticity declarations.");
      return;
    }

    try {
      setIsSubmitting(true);

      const personalInfo: DeliveryApplicationPersonalInfo = {
        fullName: fullName.trim(),
        phone: phone.replace(/\D/g, ""),
        email: email.trim().toLowerCase(),
        password,
        dateOfBirth,
        gender,
      };

      const address: DeliveryApplicationAddress = {
        houseNo: houseNo.trim(),
        street: street.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        landmark: landmark.trim(),
      };

      const vehicleInfo: DeliveryApplicationVehicleInfo = {
        vehicleType,
        brand: vehicleBrand.trim(),
        model: vehicleModel.trim(),
        registrationNumber: registrationNumber.trim().toUpperCase(),
        drivingLicenseNumber: drivingLicenseNumber.trim().toUpperCase(),
      };

      const documents = {
        profilePhoto: profilePhotoDoc!,
        idProof: {
          idType,
          document: idProofDoc!,
        },
        drivingLicense: drivingLicenseDoc || null,
        registrationCertificate: rcDoc || null,
        insurance: insuranceDoc || null,
      };

      const res = await onboardingApi.submitApplication({
        personalInfo,
        address,
        vehicleInfo,
        documents,
        termsAccepted: true,
        emailVerificationToken: emailVerificationToken || undefined,
      });

      setSubmittedAppNumber(res.applicationNumber);
      toast.success("Application submitted successfully!");
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Submission failed. Please check your data.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyApplicationNumber = () => {
    if (!submittedAppNumber) return;
    navigator.clipboard.writeText(submittedAppNumber);
    setHasCopiedAppNumber(true);
    toast.success("Application number copied to clipboard!");
    setTimeout(() => setHasCopiedAppNumber(false), 3000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF9F6] via-[#F5EFE6] to-[#FBF9F6] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <Link href="/login" className="inline-flex items-center gap-2 group mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#C86D51] to-[#D9532F] text-white flex items-center justify-center font-bold text-lg shadow-sm">
              B
            </div>
            <span className="font-bold text-lg text-[#241C1A] tracking-tight group-hover:text-[#C86D51] transition">
              BentoBabu
            </span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#241C1A] tracking-tight">
            Delivery Partner Registration
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
            Join the BentoBabu delivery fleet. Deliver healthy, delicious meals and earn competitive weekly payouts.
          </p>
        </div>

        {/* If Application Submitted Successfully */}
        {submittedAppNumber ? (
          <div className="bg-white rounded-3xl p-6 sm:p-10 border border-[#EFECE6] shadow-xl text-center space-y-6 animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border-2 border-emerald-200 shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">
                <Clock className="w-3.5 h-3.5" />
                Under Verification (24-48 Hours)
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#241C1A]">
                Application Submitted Successfully!
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                Thank you, <strong>{fullName}</strong>. Your delivery partner application has been received. Our operations team is reviewing your documents.
              </p>
            </div>

            {/* Application Reference ID Card */}
            <div className="max-w-md mx-auto p-4 rounded-2xl bg-[#FBF9F6] border border-gray-200 space-y-2 text-left">
              <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Application Reference ID
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-lg sm:text-xl font-bold text-[#C86D51] tracking-wider">
                  {submittedAppNumber}
                </div>
                <button
                  type="button"
                  onClick={copyApplicationNumber}
                  className="px-3 py-1.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 flex items-center gap-1.5 transition cursor-pointer"
                >
                  {hasCopiedAppNumber ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-gray-500" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-gray-500">
                Save this number to check your onboarding progress at any time.
              </p>
            </div>

            {/* Next Steps List */}
            <div className="max-w-md mx-auto text-left space-y-2.5 p-4 rounded-2xl bg-blue-50/50 border border-blue-100 text-xs text-blue-900">
              <div className="font-bold flex items-center gap-1.5 text-blue-800">
                <Sparkles className="w-4 h-4 text-blue-600" />
                What happens next?
              </div>
              <ul className="list-disc list-inside space-y-1 text-blue-800/90 leading-relaxed text-[11px]">
                <li>Our safety and compliance team verifies your driving license and vehicle RC.</li>
                <li>You will receive an email and in-app notification once approved.</li>
                <li>Upon approval, your login is activated immediately so you can start taking orders.</li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href={`/application-status?identifier=${encodeURIComponent(submittedAppNumber)}`}
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-[#C86D51] text-white text-xs sm:text-sm font-bold hover:bg-[#B35D42] transition shadow-md flex items-center justify-center gap-2"
              >
                <span>Track Application Status</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto px-6 py-3 rounded-2xl border border-gray-300 bg-white text-gray-700 text-xs sm:text-sm font-semibold hover:bg-gray-50 transition flex items-center justify-center"
              >
                Back to Login
              </Link>
            </div>
          </div>
        ) : (
          /* Multi-Step Wizard */
          <div className="bg-white rounded-3xl p-5 sm:p-8 border border-[#EFECE6] shadow-xl space-y-8">
            {/* Step Progress Bar */}
            <div className="relative">
              <div className="flex items-center justify-between">
                {STEPS.map((s) => {
                  const Icon = s.icon;
                  const isDone = s.id < currentStep;
                  const isCurrent = s.id === currentStep;

                  return (
                    <div key={s.id} className="flex flex-col items-center gap-1.5 z-10">
                      <div
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center font-bold text-xs transition-all ${
                          isDone
                            ? "bg-emerald-600 text-white shadow-sm"
                            : isCurrent
                            ? "bg-[#C86D51] text-white shadow-md ring-4 ring-[#C86D51]/20"
                            : "bg-[#F5EFE6] text-gray-400"
                        }`}
                      >
                        {isDone ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                      </div>
                      <span
                        className={`text-[10px] sm:text-xs font-semibold ${
                          isCurrent ? "text-[#C86D51]" : isDone ? "text-emerald-700" : "text-gray-400"
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="absolute top-4 sm:top-5 left-4 right-4 h-0.5 bg-[#F5EFE6] -z-0" />
            </div>

            {/* STEP 1: Personal Info & Email OTP */}
            {currentStep === 1 && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="border-b border-gray-100 pb-3">
                  <h2 className="text-base sm:text-lg font-bold text-[#241C1A]">
                    Step 1: Personal Information
                  </h2>
                  <p className="text-xs text-gray-500">
                    Verify your email address and enter your personal details.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Full Name */}
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Full Legal Name (as on Govt ID) *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Ramesh Kumar"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-gray-300 text-xs sm:text-sm text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 focus:border-[#C86D51] transition"
                    />
                  </div>

                  {/* Phone Number */}
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Mobile Number (10-digit Indian Number) *
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-xs font-bold text-gray-400">
                        +91
                      </span>
                      <input
                        type="tel"
                        placeholder="9876543210"
                        maxLength={16}
                        value={phone}
                        onChange={(e) => {
                          const val = e.target.value;
                          const digits = val.replace(/\D/g, "");
                          let normalized = digits;
                          if (digits.length === 11 && digits.startsWith("0")) {
                            normalized = digits.slice(1);
                          } else if (digits.length === 12 && digits.startsWith("91")) {
                            normalized = digits.slice(2);
                          } else if (digits.length === 13 && digits.startsWith("091")) {
                            normalized = digits.slice(3);
                          } else if (digits.length > 10) {
                            normalized = digits.slice(-10);
                          }
                          setPhone(normalized.slice(0, 10));
                        }}
                        className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-300 bg-white text-xs sm:text-sm text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 focus:border-[#C86D51] transition"
                      />
                    </div>
                  </div>

                  {/* Email Address with Inline OTP verification */}
                  <div className="sm:col-span-2 space-y-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Email Address *
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-xs text-gray-400">
                          <Mail className="w-4 h-4" />
                        </span>
                        <input
                          type="email"
                          disabled={isEmailVerified}
                          placeholder="e.g. partner@bentobabu.in"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={`w-full pl-10 pr-4 py-3 rounded-2xl border text-xs sm:text-sm text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 transition ${
                            isEmailVerified
                              ? "bg-emerald-50/50 border-emerald-300 font-bold text-emerald-800"
                              : "border-gray-300 bg-white focus:border-[#C86D51]"
                          }`}
                        />
                      </div>

                      {!isEmailVerified ? (
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={isSendingOtp || otpCooldown > 0 || !email.includes("@")}
                          className="px-4 py-3 rounded-2xl bg-[#C86D51] text-white text-xs font-bold hover:bg-[#B35D42] disabled:opacity-50 transition shrink-0 cursor-pointer"
                        >
                          {isSendingOtp
                            ? "Sending..."
                            : otpCooldown > 0
                            ? `Resend (${otpCooldown}s)`
                            : otpSent
                            ? "Resend Code"
                            : "Verify Email"}
                        </button>
                      ) : (
                        <div className="px-4 py-3 rounded-2xl bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5 shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Verified</span>
                        </div>
                      )}
                    </div>

                    {/* OTP Entry Box */}
                    {otpSent && !isEmailVerified && (
                      <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-3 animate-in fade-in duration-150">
                        <div className="text-xs font-semibold text-amber-900 flex items-center justify-between">
                          <span>Enter 6-digit verification code sent to {email}:</span>
                          {otpCooldown > 0 && (
                            <span className="text-[11px] text-amber-700">Expires in 10 mins</span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            maxLength={6}
                            placeholder="Enter 6-digit OTP"
                            value={otpValue}
                            onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ""))}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-amber-300 bg-white font-mono tracking-widest text-center text-sm font-bold text-[#241C1A] focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30"
                          />
                          <button
                            type="button"
                            onClick={handleVerifyOtp}
                            disabled={isVerifyingOtp || otpValue.length !== 6}
                            className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition cursor-pointer"
                          >
                            {isVerifyingOtp ? "Verifying..." : "Verify Code"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Set Password *
                    </label>
                    <input
                      type="password"
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-gray-300 text-xs sm:text-sm text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 focus:border-[#C86D51] transition"
                    />
                  </div>

                  {/* Date of Birth */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Date of Birth (Must be 18+) *
                    </label>
                    <input
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-gray-300 text-xs sm:text-sm text-[#241C1A] focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 focus:border-[#C86D51] transition"
                    />
                  </div>

                  {/* Gender */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Gender *
                    </label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as any)}
                      className="w-full px-4 py-3 rounded-2xl border border-gray-300 text-xs sm:text-sm text-[#241C1A] focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 focus:border-[#C86D51] transition bg-white"
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Address Information */}
            {currentStep === 2 && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="border-b border-gray-100 pb-3">
                  <h2 className="text-base sm:text-lg font-bold text-[#241C1A]">
                    Step 2: Residential Address
                  </h2>
                  <p className="text-xs text-gray-500">
                    Provide your current permanent address for fleet zone allocation.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* House / Flat No */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      House / Flat / Block No *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Flat 304, Green Heights"
                      value={houseNo}
                      onChange={(e) => setHouseNo(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-gray-300 text-xs sm:text-sm text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 focus:border-[#C86D51] transition"
                    />
                  </div>

                  {/* Street / Area */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Street / Area / Colony *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. SN Banerjee Road, Chandanpukur"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-gray-300 text-xs sm:text-sm text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 focus:border-[#C86D51] transition"
                    />
                  </div>

                  {/* Landmark */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Landmark (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Near Apollo Pharmacy"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-gray-300 text-xs sm:text-sm text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 focus:border-[#C86D51] transition"
                    />
                  </div>

                  {/* City */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      City *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Barrackpore"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-gray-300 text-xs sm:text-sm text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 focus:border-[#C86D51] transition"
                    />
                  </div>

                  {/* State */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      State *
                    </label>
                    <select
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-gray-300 text-xs sm:text-sm text-[#241C1A] focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 focus:border-[#C86D51] transition bg-white"
                    >
                      {INDIAN_STATES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* PIN Code */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      6-Digit PIN Code *
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. 700120"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
                      className="w-full px-4 py-3 rounded-2xl border border-gray-300 text-xs sm:text-sm text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 focus:border-[#C86D51] transition"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Vehicle Selection */}
            {currentStep === 3 && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="border-b border-gray-100 pb-3">
                  <h2 className="text-base sm:text-lg font-bold text-[#241C1A]">
                    Step 3: Vehicle Information
                  </h2>
                  <p className="text-xs text-gray-500">
                    Select your delivery conveyance. Bicycles require no driving license or RC.
                  </p>
                </div>

                {/* Vehicle Types Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { type: "BICYCLE", label: "Bicycle", desc: "No DL / RC needed", icon: Bike },
                    { type: "MOTORCYCLE", label: "Motorcycle", desc: "Standard gear bike", icon: Bike },
                    { type: "SCOOTER", label: "Scooter", desc: "Gearless scooter", icon: Bike },
                    { type: "ELECTRIC_VEHICLE", label: "Electric Vehicle", desc: "EV 2-wheeler", icon: Car },
                  ].map((v) => {
                    const Icon = v.icon;
                    const isSelected = vehicleType === v.type;

                    return (
                      <button
                        key={v.type}
                        type="button"
                        onClick={() => setVehicleType(v.type as DeliveryVehicleType)}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? "border-[#C86D51] bg-[#FFF5F1] ring-2 ring-[#C86D51]/20 shadow-sm"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        }`}
                      >
                        <Icon
                          className={`w-6 h-6 mb-2 ${
                            isSelected ? "text-[#C86D51]" : "text-gray-500"
                          }`}
                        />
                        <div className="font-bold text-xs sm:text-sm text-[#241C1A]">
                          {v.label}
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{v.desc}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Motorized vehicle fields */}
                {vehicleType !== "BICYCLE" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    {/* Brand */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Vehicle Brand
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Honda, Hero, TVS, Ather"
                        value={vehicleBrand}
                        onChange={(e) => setVehicleBrand(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl border border-gray-300 text-xs sm:text-sm text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 focus:border-[#C86D51] transition"
                      />
                    </div>

                    {/* Model */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Vehicle Model
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Activa 6G, Splendor Plus"
                        value={vehicleModel}
                        onChange={(e) => setVehicleModel(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl border border-gray-300 text-xs sm:text-sm text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 focus:border-[#C86D51] transition"
                      />
                    </div>

                    {/* Registration Number */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Vehicle Registration Number *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. KA03HA1234"
                        value={registrationNumber}
                        onChange={(e) => setRegistrationNumber(e.target.value.toUpperCase())}
                        className="w-full px-4 py-3 rounded-2xl border border-gray-300 text-xs sm:text-sm font-mono uppercase text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 focus:border-[#C86D51] transition"
                      />
                    </div>

                    {/* Driving License Number */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Driving License Number *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. KA0320180005678"
                        value={drivingLicenseNumber}
                        onChange={(e) => setDrivingLicenseNumber(e.target.value.toUpperCase())}
                        className="w-full px-4 py-3 rounded-2xl border border-gray-300 text-xs sm:text-sm font-mono uppercase text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 focus:border-[#C86D51] transition"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-xs text-emerald-800">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold">Bicycle partner benefits:</strong>
                      Zero fuel costs, low carbon footprint, and no commercial driver license or RC required!
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 4: Document Verification Uploads */}
            {currentStep === 4 && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="border-b border-gray-100 pb-3">
                  <h2 className="text-base sm:text-lg font-bold text-[#241C1A]">
                    Step 4: Document Verification
                  </h2>
                  <p className="text-xs text-gray-500">
                    Upload clear photos or PDFs (max 10MB per document).
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Document 1: Profile Photo */}
                  <div className="p-4 rounded-2xl border border-gray-200 bg-[#FBF9F6] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                        <User className="w-4 h-4 text-[#C86D51]" />
                        1. Profile Photo (Face Picture) *
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Clear passport-style photo without sunglasses or cap.
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-3">
                      {profilePhotoDoc ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Uploaded
                          </span>
                          <label className="text-xs text-[#C86D51] font-semibold underline cursor-pointer hover:text-[#B35D42]">
                            Replace
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(e) => handleFileUpload(e, "profilePhoto")}
                            />
                          </label>
                        </div>
                      ) : (
                        <label className="px-4 py-2 rounded-xl bg-white border border-gray-300 hover:border-gray-400 text-xs font-bold text-gray-700 flex items-center gap-2 cursor-pointer transition shadow-sm">
                          <Upload className="w-3.5 h-3.5 text-[#C86D51]" />
                          <span>
                            {uploadingCategory === "profilePhoto" ? "Uploading..." : "Upload Photo"}
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => handleFileUpload(e, "profilePhoto")}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Document 2: Government ID Proof */}
                  <div className="p-4 rounded-2xl border border-gray-200 bg-[#FBF9F6] space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-[#C86D51]" />
                          2. Government ID Proof *
                        </div>
                        <p className="text-[11px] text-gray-500">
                          Upload your Aadhaar Card, PAN Card, or Voter ID.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={idType}
                          onChange={(e) => setIdType(e.target.value as any)}
                          className="px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white text-xs font-semibold text-gray-700"
                        >
                          <option value="AADHAAR">Aadhaar Card</option>
                          <option value="PAN">PAN Card</option>
                          <option value="VOTER_ID">Voter ID</option>
                        </select>

                        {idProofDoc ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              Uploaded
                            </span>
                            <label className="text-xs text-[#C86D51] font-semibold underline cursor-pointer hover:text-[#B35D42]">
                              Replace
                              <input
                                type="file"
                                accept="image/jpeg,image/png,application/pdf"
                                className="hidden"
                                onChange={(e) => handleFileUpload(e, "idProof")}
                              />
                            </label>
                          </div>
                        ) : (
                          <label className="px-4 py-2 rounded-xl bg-white border border-gray-300 hover:border-gray-400 text-xs font-bold text-gray-700 flex items-center gap-2 cursor-pointer transition shadow-sm">
                            <Upload className="w-3.5 h-3.5 text-[#C86D51]" />
                            <span>
                              {uploadingCategory === "idProof" ? "Uploading..." : "Upload Document"}
                            </span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,application/pdf"
                              className="hidden"
                              onChange={(e) => handleFileUpload(e, "idProof")}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Document 3: Driving License (Conditional) */}
                  {vehicleType !== "BICYCLE" && (
                    <div className="p-4 rounded-2xl border border-gray-200 bg-[#FBF9F6] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-[#C86D51]" />
                          3. Driving License (DL) *
                        </div>
                        <p className="text-[11px] text-gray-500">
                          Front & back side of valid commercial or private DL.
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-3">
                        {drivingLicenseDoc ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              Uploaded
                            </span>
                            <label className="text-xs text-[#C86D51] font-semibold underline cursor-pointer hover:text-[#B35D42]">
                              Replace
                              <input
                                type="file"
                                accept="image/jpeg,image/png,application/pdf"
                                className="hidden"
                                onChange={(e) => handleFileUpload(e, "drivingLicense")}
                              />
                            </label>
                          </div>
                        ) : (
                          <label className="px-4 py-2 rounded-xl bg-white border border-gray-300 hover:border-gray-400 text-xs font-bold text-gray-700 flex items-center gap-2 cursor-pointer transition shadow-sm">
                            <Upload className="w-3.5 h-3.5 text-[#C86D51]" />
                            <span>
                              {uploadingCategory === "drivingLicense" ? "Uploading..." : "Upload DL"}
                            </span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,application/pdf"
                              className="hidden"
                              onChange={(e) => handleFileUpload(e, "drivingLicense")}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Document 4: Vehicle Registration Certificate (RC) */}
                  {vehicleType !== "BICYCLE" && (
                    <div className="p-4 rounded-2xl border border-gray-200 bg-[#FBF9F6] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-gray-600" />
                          4. Vehicle Registration Certificate (RC)
                        </div>
                        <p className="text-[11px] text-gray-500">
                          Copy of vehicle RC or smart card document.
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-3">
                        {rcDoc ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              Uploaded
                            </span>
                            <label className="text-xs text-[#C86D51] font-semibold underline cursor-pointer hover:text-[#B35D42]">
                              Replace
                              <input
                                type="file"
                                accept="image/jpeg,image/png,application/pdf"
                                className="hidden"
                                onChange={(e) => handleFileUpload(e, "rc")}
                              />
                            </label>
                          </div>
                        ) : (
                          <label className="px-4 py-2 rounded-xl bg-white border border-gray-300 hover:border-gray-400 text-xs font-bold text-gray-700 flex items-center gap-2 cursor-pointer transition shadow-sm">
                            <Upload className="w-3.5 h-3.5 text-gray-500" />
                            <span>
                              {uploadingCategory === "rc" ? "Uploading..." : "Upload RC"}
                            </span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,application/pdf"
                              className="hidden"
                              onChange={(e) => handleFileUpload(e, "rc")}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Document 5: Insurance */}
                  {vehicleType !== "BICYCLE" && (
                    <div className="p-4 rounded-2xl border border-gray-200 bg-[#FBF9F6] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-gray-600" />
                          5. Vehicle Insurance (Optional)
                        </div>
                        <p className="text-[11px] text-gray-500">
                          Active comprehensive or third-party insurance copy.
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-3">
                        {insuranceDoc ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              Uploaded
                            </span>
                            <label className="text-xs text-[#C86D51] font-semibold underline cursor-pointer hover:text-[#B35D42]">
                              Replace
                              <input
                                type="file"
                                accept="image/jpeg,image/png,application/pdf"
                                className="hidden"
                                onChange={(e) => handleFileUpload(e, "insurance")}
                              />
                            </label>
                          </div>
                        ) : (
                          <label className="px-4 py-2 rounded-xl bg-white border border-gray-300 hover:border-gray-400 text-xs font-bold text-gray-700 flex items-center gap-2 cursor-pointer transition shadow-sm">
                            <Upload className="w-3.5 h-3.5 text-gray-500" />
                            <span>
                              {uploadingCategory === "insurance" ? "Uploading..." : "Upload Insurance"}
                            </span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,application/pdf"
                              className="hidden"
                              onChange={(e) => handleFileUpload(e, "insurance")}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 5: Review & Submit */}
            {currentStep === 5 && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="border-b border-gray-100 pb-3">
                  <h2 className="text-base sm:text-lg font-bold text-[#241C1A]">
                    Step 5: Review & Submit Application
                  </h2>
                  <p className="text-xs text-gray-500">
                    Verify all information before submitting to our onboarding team.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Summary: Personal & Contact */}
                  <div className="p-4 rounded-2xl bg-[#FBF9F6] border border-gray-200 space-y-2">
                    <div className="flex items-center justify-between border-b border-gray-200/80 pb-2">
                      <span className="text-xs font-bold text-[#C86D51] uppercase tracking-wider flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        Personal Details
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentStep(1)}
                        className="text-xs text-gray-500 hover:text-[#C86D51] font-medium"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500 block text-[11px]">Name:</span>
                        <strong className="text-gray-800">{fullName}</strong>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[11px]">Mobile:</span>
                        <strong className="text-gray-800">+91 {phone}</strong>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[11px]">Email:</span>
                        <strong className="text-gray-800">{email} (Verified)</strong>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[11px]">Date of Birth / Gender:</span>
                        <strong className="text-gray-800">{dateOfBirth} ({gender})</strong>
                      </div>
                    </div>
                  </div>

                  {/* Summary: Address */}
                  <div className="p-4 rounded-2xl bg-[#FBF9F6] border border-gray-200 space-y-2">
                    <div className="flex items-center justify-between border-b border-gray-200/80 pb-2">
                      <span className="text-xs font-bold text-[#C86D51] uppercase tracking-wider flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        Residential Address
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentStep(2)}
                        className="text-xs text-gray-500 hover:text-[#C86D51] font-medium"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="text-xs text-gray-800 leading-relaxed">
                      {houseNo}, {street}
                      {landmark && `, Near ${landmark}`}
                      <br />
                      {city}, {state} — <strong>{pincode}</strong>
                    </div>
                  </div>

                  {/* Summary: Vehicle & Documents */}
                  <div className="p-4 rounded-2xl bg-[#FBF9F6] border border-gray-200 space-y-2">
                    <div className="flex items-center justify-between border-b border-gray-200/80 pb-2">
                      <span className="text-xs font-bold text-[#C86D51] uppercase tracking-wider flex items-center gap-1.5">
                        <Bike className="w-3.5 h-3.5" />
                        Vehicle & Documents
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentStep(3)}
                        className="text-xs text-gray-500 hover:text-[#C86D51] font-medium"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500 block text-[11px]">Vehicle Type:</span>
                        <strong className="text-gray-800">{vehicleType.replace('_', ' ')}</strong>
                      </div>
                      {vehicleType !== "BICYCLE" && (
                        <>
                          <div>
                            <span className="text-gray-500 block text-[11px]">Reg Number:</span>
                            <strong className="text-gray-800">{registrationNumber}</strong>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-[11px]">DL Number:</span>
                            <strong className="text-gray-800">{drivingLicenseNumber}</strong>
                          </div>
                        </>
                      )}
                      <div>
                        <span className="text-gray-500 block text-[11px]">Profile Photo:</span>
                        <span className="text-emerald-700 font-bold">Uploaded ✓</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[11px]">ID Proof ({idType}):</span>
                        <span className="text-emerald-700 font-bold">Uploaded ✓</span>
                      </div>
                    </div>
                  </div>

                  {/* Declarations */}
                  <div className="space-y-3 pt-2">
                    <label className="flex items-start gap-2.5 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreeTerms}
                        onChange={(e) => setAgreeTerms(e.target.checked)}
                        className="mt-0.5 rounded text-[#C86D51] focus:ring-[#C86D51]"
                      />
                      <span>
                        I agree to the <strong>BentoBabu Delivery Partner Agreement</strong> and Code of Conduct. I understand that account activation requires document verification by the operations team.
                      </span>
                    </label>

                    <label className="flex items-start gap-2.5 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreeAuthenticity}
                        onChange={(e) => setAgreeAuthenticity(e.target.checked)}
                        className="mt-0.5 rounded text-[#C86D51] focus:ring-[#C86D51]"
                      />
                      <span>
                        I declare that all information and uploaded documents provided in this application are genuine, correct, and legally belong to me.
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Wizard Navigation Footer */}
            <div className="pt-4 border-t border-gray-100 flex items-center justify-between gap-3">
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="px-5 py-3 rounded-2xl border border-gray-300 text-gray-700 font-bold text-xs sm:text-sm hover:bg-gray-50 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
              ) : (
                <Link
                  href="/login"
                  className="text-xs font-semibold text-gray-500 hover:text-gray-800 transition"
                >
                  Already registered? Sign In
                </Link>
              )}

              {currentStep < 5 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="ml-auto px-6 py-3 rounded-2xl bg-[#C86D51] text-white font-bold text-xs sm:text-sm hover:bg-[#B35D42] transition shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting || !agreeTerms || !agreeAuthenticity}
                  onClick={handleSubmitApplication}
                  className="ml-auto px-7 py-3.5 rounded-2xl bg-emerald-600 text-white font-bold text-xs sm:text-sm hover:bg-emerald-700 transition shadow-lg disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Submitting Application...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit Application</span>
                      <CheckCircle2 className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
