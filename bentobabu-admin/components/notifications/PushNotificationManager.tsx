"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Bell,
  BellRing,
  BellOff,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Send,
  Loader2,
  Info,
  Apple,
  ShieldCheck,
  ShieldAlert,
  Server,
  Radio,
  Sliders,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ExternalLink,
  Laptop,
} from "lucide-react";
import { toast } from "sonner";
import {
  pushNotificationService,
  PushDevice,
  DiagnosticStatus,
  NotificationPreferences,
} from "@/services/pushNotificationService";
import { isPushMessagingSupported, firebaseConfig } from "@/config/firebase";

export function PushNotificationManager() {
  const [diag, setDiag] = useState<DiagnosticStatus>({
    permission: "default",
    isPushSupported: true,
    isServiceWorkerSupported: true,
    isServiceWorkerRegistered: false,
    isFirebaseConfigured: false,
    hasVapidKey: false,
    isCurrentDeviceRegistered: false,
    currentDeviceTokenMasked: null,
  });

  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState<boolean>(true);
  const [isEnabling, setIsEnabling] = useState<boolean>(false);
  const [isDisabling, setIsDisabling] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    details?: string;
    timestamp: string;
  } | null>(null);

  // Notification Preferences State
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    push: true,
    newOrderPushEnabled: true,
    orderUpdatePushEnabled: true,
  });
  const [isLoadingPrefs, setIsLoadingPrefs] = useState<boolean>(true);
  const [isSavingPrefs, setIsSavingPrefs] = useState<boolean>(false);

  // UI state
  const [showTroubleshooting, setShowTroubleshooting] = useState<boolean>(false);
  const [isIos, setIsIos] = useState<boolean>(false);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);

  // Load diagnostics and browser state
  const refreshDiagnostics = useCallback(async () => {
    if (typeof window === "undefined") return;

    const ua = navigator.userAgent;
    setIsIos(/iPad|iPhone|iPod/.test(ua));
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as unknown as { standalone?: boolean }).standalone)
    );

    const status = await pushNotificationService.getDiagnosticStatus();
    setDiag(status);
  }, []);

  // Fetch staff member's registered devices
  const loadDevices = useCallback(async () => {
    setIsLoadingDevices(true);
    try {
      const data = await pushNotificationService.getRegisteredDevices();
      setDevices(data.devices || []);
    } catch (err) {
      console.warn("Could not load push devices:", err);
    } finally {
      setIsLoadingDevices(false);
    }
  }, []);

  // Fetch staff notification preferences
  const loadPreferences = useCallback(async () => {
    setIsLoadingPrefs(true);
    try {
      const p = await pushNotificationService.getPreferences();
      setPrefs({
        push: p.push ?? true,
        newOrderPushEnabled: p.newOrderPushEnabled ?? true,
        orderUpdatePushEnabled: p.orderUpdatePushEnabled ?? true,
      });
    } catch (err) {
      console.warn("Could not load notification preferences:", err);
    } finally {
      setIsLoadingPrefs(false);
    }
  }, []);

  useEffect(() => {
    refreshDiagnostics();
    loadDevices();
    loadPreferences();
  }, [refreshDiagnostics, loadDevices, loadPreferences]);

  // Handle Enable Notifications (Section A)
  const handleEnableNotifications = async () => {
    setIsEnabling(true);
    try {
      const result = await pushNotificationService.enableNotificationsOnCurrentDevice();

      if (result.success) {
        toast.success("Push Notifications Enabled!", {
          description: "This device is registered to receive instant new order alerts.",
        });
        await refreshDiagnostics();
        await loadDevices();
      } else if (result.permissionDenied) {
        toast.error("Permission Blocked", {
          description: result.error || "Please allow notifications in your browser address bar.",
        });
        await refreshDiagnostics();
      } else {
        toast.error("Registration Failed", {
          description: result.error || "Unable to register device token with backend.",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to register notifications";
      toast.error("Registration Error", { description: msg });
    } finally {
      setIsEnabling(false);
    }
  };

  // Handle Disable on Current Device (Section B)
  const handleDisableCurrentDevice = async () => {
    setIsDisabling(true);
    try {
      const res = await pushNotificationService.disableNotificationsOnCurrentDevice();
      if (res.success) {
        toast.success("Notifications Disabled", {
          description: "This device has been unregistered from push alerts.",
        });
        await refreshDiagnostics();
        await loadDevices();
      } else {
        toast.error("Error", { description: res.error || "Failed to disable notifications." });
      }
    } finally {
      setIsDisabling(false);
    }
  };

  // Handle Send Test Notification (Section C)
  const handleSendTestNotification = async () => {
    setIsTesting(true);
    try {
      const res = await pushNotificationService.sendTestNotification();
      if (res.success) {
        setTestResult({
          success: true,
          message: res.message,
          details: `FCM server accepted dispatch for ${res.data?.successCount ?? 1} device(s). Note: Visual display depends on your operating system and browser focus.`,
          timestamp: new Date().toLocaleTimeString(),
        });
        toast.success("Test Alert Dispatched", {
          description: "Dispatched via Firebase Cloud Messaging. Check your screen or notification center.",
        });
      } else {
        setTestResult({
          success: false,
          message: res.message || "Failed to send test push notification.",
          timestamp: new Date().toLocaleTimeString(),
        });
        toast.error("Test Dispatch Failed", {
          description: res.message,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send test push";
      setTestResult({
        success: false,
        message: msg,
        timestamp: new Date().toLocaleTimeString(),
      });
      toast.error("Test Error", { description: msg });
    } finally {
      setIsTesting(false);
    }
  };

  // Handle Save Preferences (Section D)
  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPrefs(true);
    try {
      const updated = await pushNotificationService.updatePreferences(prefs);
      setPrefs({
        push: updated.push ?? true,
        newOrderPushEnabled: updated.newOrderPushEnabled ?? true,
        orderUpdatePushEnabled: updated.orderUpdatePushEnabled ?? true,
      });
      toast.success("Preferences Saved", {
        description: "Your staff push notification alert settings have been updated.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save preferences";
      toast.error("Failed to Save", { description: msg });
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const isCurrentActive = diag.permission === "granted" && diag.isCurrentDeviceRegistered;

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------- */}
      {/* SECTION A: BROWSER PUSH NOTIFICATION STATUS CARDS   */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E5DFC5] shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E5DFC5]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#354B35]/10 flex items-center justify-center text-[#354B35]">
              {isCurrentActive ? (
                <BellRing className="w-6 h-6 text-[#354B35]" />
              ) : (
                <Bell className="w-6 h-6 text-[#B99A60]" />
              )}
            </div>
            <div>
              <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#1E2B1E]">
                Kitchen & Admin Push Alerts
              </h2>
              <p className="text-xs text-[#667266] mt-0.5">
                Real-time Web Push notifications for incoming customer orders, dispatched via Firebase Cloud Messaging.
              </p>
            </div>
          </div>

          {/* Master Status Badge */}
          <div className="shrink-0 flex items-center gap-2">
            <button
              onClick={() => {
                refreshDiagnostics();
                loadDevices();
                loadPreferences();
              }}
              title="Refresh status"
              className="p-2 rounded-xl text-[#667266] hover:text-[#354B35] hover:bg-[#F7F3EA] border border-[#E5DFC5] transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {isCurrentActive ? (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Alerts Active on This Device
              </span>
            ) : diag.permission === "denied" ? (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                Permission Blocked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">
                <BellOff className="w-4 h-4 text-amber-600" />
                Not Configured on This Device
              </span>
            )}
          </div>
        </div>

        {/* 4 Diagnostic Status Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Tile 1: Browser Permission */}
          <div className="p-4 rounded-2xl bg-[#FDFBF7] border border-[#E5DFC5] flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                diag.permission === "granted"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : diag.permission === "denied"
                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}
            >
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#667266] uppercase tracking-wider">
                Permission
              </div>
              <div className="text-sm font-bold text-[#1E2B1E] capitalize mt-0.5">
                {diag.permission === "default" ? "Not Requested" : diag.permission}
              </div>
              <div className="text-[10px] text-[#8A9A86] mt-0.5">
                {diag.permission === "granted"
                  ? "Browser permits notifications"
                  : diag.permission === "denied"
                  ? "Blocked in browser settings"
                  : "Click Enable below to allow"}
              </div>
            </div>
          </div>

          {/* Tile 2: Firebase Web Push Support */}
          <div className="p-4 rounded-2xl bg-[#FDFBF7] border border-[#E5DFC5] flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                diag.isPushSupported
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-rose-50 text-rose-700 border border-rose-200"
              }`}
            >
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#667266] uppercase tracking-wider">
                Push Support
              </div>
              <div className="text-sm font-bold text-[#1E2B1E] mt-0.5">
                {diag.isPushSupported ? "Supported" : "Unsupported"}
              </div>
              <div className="text-[10px] text-[#8A9A86] mt-0.5">
                {diag.isPushSupported ? "PushManager API available" : "Browser lacks push support"}
              </div>
            </div>
          </div>

          {/* Tile 3: Service Worker Registration */}
          <div className="p-4 rounded-2xl bg-[#FDFBF7] border border-[#E5DFC5] flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                diag.isServiceWorkerRegistered
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-gray-100 text-gray-600 border border-gray-200"
              }`}
            >
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#667266] uppercase tracking-wider">
                Service Worker
              </div>
              <div className="text-sm font-bold text-[#1E2B1E] mt-0.5">
                {diag.isServiceWorkerRegistered ? "Active & Ready" : "Unregistered"}
              </div>
              <div className="text-[10px] text-[#8A9A86] mt-0.5">
                /firebase-messaging-sw.js
              </div>
            </div>
          </div>

          {/* Tile 4: Device Sync */}
          <div className="p-4 rounded-2xl bg-[#FDFBF7] border border-[#E5DFC5] flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                diag.isCurrentDeviceRegistered
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}
            >
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#667266] uppercase tracking-wider">
                This Device
              </div>
              <div className="text-sm font-bold text-[#1E2B1E] mt-0.5">
                {diag.isCurrentDeviceRegistered ? "Synced" : "Not Registered"}
              </div>
              <div className="text-[10px] text-[#8A9A86] mt-0.5 truncate max-w-[130px]">
                {diag.currentDeviceTokenMasked || "Token not registered"}
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls & Primary CTA */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[#E5DFC5]">
          <div className="flex flex-wrap items-center gap-3">
            {!isCurrentActive ? (
              <button
                type="button"
                onClick={handleEnableNotifications}
                disabled={isEnabling || !diag.isPushSupported}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#354B35] text-white text-xs font-bold hover:bg-[#253525] disabled:opacity-50 transition-all shadow-xs cursor-pointer"
              >
                {isEnabling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#B99A60]" />
                    <span>Configuring Device Push...</span>
                  </>
                ) : (
                  <>
                    <BellRing className="w-4 h-4 text-[#B99A60]" />
                    <span>Enable Browser Notifications</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDisableCurrentDevice}
                disabled={isDisabling}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 bg-white text-rose-700 text-xs font-semibold hover:bg-rose-50 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isDisabling ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <BellOff className="w-3.5 h-3.5" />
                )}
                <span>Disable on This Device</span>
              </button>
            )}

            {/* Section C: Send Test Notification Button */}
            <button
              type="button"
              onClick={handleSendTestNotification}
              disabled={isTesting || devices.filter((d) => d.isActive).length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#354B35]/30 bg-[#EBF0E9] text-[#354B35] text-xs font-bold hover:bg-[#DCE5D9] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending Test Alert...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 text-[#B99A60]" />
                  <span>Send Test Notification</span>
                </>
              )}
            </button>
          </div>

          <div className="text-[11px] text-[#667266]">
            {devices.filter((d) => d.isActive).length === 0
              ? "⚠️ No active devices registered to receive notifications."
              : `✓ Dispatches to all ${devices.filter((d) => d.isActive).length} active staff device(s).`}
          </div>
        </div>

        {/* Test Result Display Banner */}
        {testResult && (
          <div
            className={`p-4 rounded-2xl border text-xs flex items-start justify-between gap-3 animate-in fade-in ${
              testResult.success
                ? "bg-emerald-50/70 border-emerald-200 text-emerald-800"
                : "bg-rose-50/70 border-rose-200 text-rose-800"
            }`}
          >
            <div className="flex items-start gap-2.5">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-bold">{testResult.message}</p>
                {testResult.details && (
                  <p className="text-[11px] mt-0.5 opacity-90">{testResult.details}</p>
                )}
              </div>
            </div>
            <span className="text-[10px] opacity-70 shrink-0">{testResult.timestamp}</span>
          </div>
        )}

        {/* Permission Denied Advice */}
        {diag.permission === "denied" && (
          <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200 text-rose-800 text-xs flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Notifications are blocked in your browser</p>
              <p className="leading-relaxed">
                You previously denied notifications. To unblock: click the lock/settings icon beside the URL in your browser address bar, set Notifications to <strong>Allow</strong>, and then refresh this page.
              </p>
            </div>
          </div>
        )}

        {/* iOS PWA Guidance */}
        {isIos && !isStandalone && (
          <div className="p-4 rounded-2xl bg-[#FAF8F2] border border-[#DFC89B] text-[#354B35] text-xs flex items-start gap-3">
            <Apple className="w-5 h-5 text-[#8C713B] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-[#1E2B1E]">iOS / Safari Push Requirement</p>
              <p className="text-[#667266] leading-relaxed">
                iOS requires the web app to be added to your <strong>Home Screen</strong> to receive background push alerts. Tap the <strong>Share</strong> button in Safari, choose <strong>&quot;Add to Home Screen&quot;</strong>, then open the installed BentoBabu app from your home screen.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION D: STAFF NOTIFICATION PREFERENCES            */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E5DFC5] shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#E5DFC5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F7F3EA] flex items-center justify-center text-[#354B35]">
              <Sliders className="w-5 h-5 text-[#B99A60]" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                Staff Notification Preferences
              </h3>
              <p className="text-xs text-[#667266]">
                Configure which operational order alerts trigger push notifications on your staff account.
              </p>
            </div>
          </div>
          {isLoadingPrefs && <Loader2 className="w-4 h-4 animate-spin text-[#667266]" />}
        </div>

        <form onSubmit={handleSavePreferences} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Preference 1: New Order Alert */}
            <div className="p-4 rounded-2xl border border-[#E5DFC5] bg-[#FDFBF7] flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-bold text-[#1E2B1E]">New Order Alerts</div>
                <div className="text-[11px] text-[#667266] leading-relaxed">
                  Receive instant push alerts whenever a customer places a new meal order.
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={Boolean(prefs.newOrderPushEnabled)}
                  onChange={(e) =>
                    setPrefs((prev) => ({ ...prev, newOrderPushEnabled: e.target.checked }))
                  }
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-gray-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#354B35]"></div>
              </label>
            </div>

            {/* Preference 2: Order Status Updates */}
            <div className="p-4 rounded-2xl border border-[#E5DFC5] bg-[#FDFBF7] flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-bold text-[#1E2B1E]">Order Status Updates</div>
                <div className="text-[11px] text-[#667266] leading-relaxed">
                  Receive push alerts on status transitions (kitchen prep, ready for dispatch).
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={Boolean(prefs.orderUpdatePushEnabled)}
                  onChange={(e) =>
                    setPrefs((prev) => ({ ...prev, orderUpdatePushEnabled: e.target.checked }))
                  }
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-gray-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#354B35]"></div>
              </label>
            </div>

            {/* Preference 3: Master Push Switch */}
            <div className="p-4 rounded-2xl border border-[#E5DFC5] bg-[#FDFBF7] flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-bold text-[#1E2B1E]">Master Push Enable</div>
                <div className="text-[11px] text-[#667266] leading-relaxed">
                  Master on/off switch for all push notification channels on this staff account.
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={Boolean(prefs.push)}
                  onChange={(e) => setPrefs((prev) => ({ ...prev, push: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-gray-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#354B35]"></div>
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSavingPrefs}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#354B35] text-white text-xs font-bold hover:bg-[#253525] disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            >
              {isSavingPrefs ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Notification Preferences</span>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION B: REGISTERED DEVICES LIST TABLE            */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E5DFC5] shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E5DFC5]">
          <div>
            <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
              Registered Staff Push Devices ({devices.length})
            </h3>
            <p className="text-xs text-[#667266]">
              All browsers and mobile devices linked to your staff account for order push dispatches.
            </p>
          </div>
          <button
            onClick={loadDevices}
            disabled={isLoadingDevices}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5DFC5] text-xs font-semibold text-[#667266] hover:bg-[#F7F3EA] cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDevices ? "animate-spin" : ""}`} />
            <span>Refresh Devices</span>
          </button>
        </div>

        {isLoadingDevices ? (
          <div className="py-8 flex items-center justify-center text-xs text-[#667266] gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#354B35]" />
            <span>Loading registered devices...</span>
          </div>
        ) : devices.length === 0 ? (
          <div className="py-8 text-center rounded-2xl bg-[#F9F7F1] border border-[#E5DFC5] text-xs text-[#667266] space-y-1">
            <Smartphone className="w-6 h-6 mx-auto text-[#B99A60] mb-2 opacity-80" />
            <p className="font-semibold text-[#1E2B1E]">No Registered Devices Found</p>
            <p>Click &quot;Enable Browser Notifications&quot; above to register this browser for real-time alerts.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5DFC5] text-[#8A9A86] text-[10px] uppercase font-bold tracking-wider">
                  <th className="py-3 px-4">Device & Browser</th>
                  <th className="py-3 px-4">Platform</th>
                  <th className="py-3 px-4">FCM Token (Masked)</th>
                  <th className="py-3 px-4">Registered Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DFC5]/60 text-[#1E2B1E]">
                {devices.map((device) => {
                  const isCurrent =
                    diag.currentDeviceTokenMasked &&
                    device.maskedToken === diag.currentDeviceTokenMasked;

                  return (
                    <tr
                      key={device.id}
                      className={`hover:bg-[#F7F3EA]/40 transition-colors ${
                        isCurrent ? "bg-[#354B35]/5 font-medium" : ""
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#354B35]/10 flex items-center justify-center text-[#354B35] shrink-0">
                            {device.platform === "IOS" || device.platform === "ANDROID" ? (
                              <Smartphone className="w-3.5 h-3.5" />
                            ) : (
                              <Laptop className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 font-bold">
                              <span>{device.deviceName || "Web Browser"}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#354B35] text-white">
                                  This Device
                                </span>
                              )}
                            </div>
                            {device.browser && (
                              <div className="text-[10px] text-[#667266]">{device.browser}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#667266]">
                        {device.platform}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-[#667266]">
                        {device.maskedToken}
                      </td>
                      <td className="py-3.5 px-4 text-[#667266]">
                        {new Date(device.createdAt || device.lastSeenAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            device.isActive
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : "bg-gray-100 text-gray-600 border border-gray-200"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              device.isActive ? "bg-emerald-600" : "bg-gray-400"
                            }`}
                          />
                          {device.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {isCurrent ? (
                          <button
                            type="button"
                            onClick={handleDisableCurrentDevice}
                            disabled={isDisabling}
                            className="px-2.5 py-1 rounded-lg border border-rose-200 text-rose-700 text-[10px] font-bold hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            Unregister
                          </button>
                        ) : (
                          <span className="text-[10px] text-[#8A9A86] italic">
                            Other session
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION E: TROUBLESHOOTING & DIAGNOSTICS            */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white rounded-3xl p-6 border border-[#E5DFC5] shadow-xs">
        <button
          type="button"
          onClick={() => setShowTroubleshooting((prev) => !prev)}
          className="w-full flex items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <HelpCircle className="w-5 h-5 text-[#B99A60]" />
            <div>
              <h4 className="font-serif text-base font-bold text-[#1E2B1E]">
                Troubleshooting & Notification Diagnostics
              </h4>
              <p className="text-xs text-[#667266]">
                Browser requirements, permission unblocking instructions, and rate limit rules.
              </p>
            </div>
          </div>
          {showTroubleshooting ? (
            <ChevronUp className="w-5 h-5 text-[#667266]" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[#667266]" />
          )}
        </button>

        {showTroubleshooting && (
          <div className="mt-5 pt-4 border-t border-[#E5DFC5] space-y-4 text-xs text-[#667266] animate-in fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-[#FDFBF7] border border-[#E5DFC5] space-y-2">
                <div className="font-bold text-[#1E2B1E] flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-[#354B35]" />
                  <span>How to Unblock Permissions in Chrome / Edge</span>
                </div>
                <p className="leading-relaxed">
                  1. Click the view site information / lock icon to the left of the website address (URL).<br />
                  2. Toggle <strong>Notifications</strong> to <strong>Allow</strong>.<br />
                  3. If prompted, reload the page and click <strong>Enable Browser Notifications</strong>.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#FDFBF7] border border-[#E5DFC5] space-y-2">
                <div className="font-bold text-[#1E2B1E] flex items-center gap-1.5">
                  <Apple className="w-4 h-4 text-[#8C713B]" />
                  <span>iPhone & iPad (iOS 16.4+) Requirements</span>
                </div>
                <p className="leading-relaxed">
                  Apple requires progressive web apps (PWAs) to be added to the Home Screen to support push messaging. In Safari, tap <strong>Share &gt; Add to Home Screen</strong>, open the app from your home screen, and click Enable Notifications.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#FDFBF7] border border-[#E5DFC5] space-y-2">
                <div className="font-bold text-[#1E2B1E] flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-[#354B35]" />
                  <span>Rate Limiting & FCM Acceptance</span>
                </div>
                <p className="leading-relaxed">
                  The test notification endpoint is protected by a rate limiter allowing a maximum of <strong>5 tests per 15 minutes</strong> per staff user. Successful API return indicates acceptance by Firebase Cloud Messaging.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#FDFBF7] border border-[#E5DFC5] space-y-2">
                <div className="font-bold text-[#1E2B1E] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#354B35]" />
                  <span>Security & Token Protection</span>
                </div>
                <p className="leading-relaxed">
                  FCM tokens are securely scoped to authenticated ADMIN and KITCHEN staff. Tokens are masked on all API responses and dead/unregistered tokens are pruned automatically upon dispatch.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
