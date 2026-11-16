"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { MonitoredPartner } from "@/services/deliveryOperationsService";
import {
  MapPin,
  Compass,
  Battery,
  Clock,
  Radio,
  ExternalLink,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Navigation,
} from "lucide-react";

interface PartnerLocationMapProps {
  partners: MonitoredPartner[];
  selectedPartnerId: string | null;
  onSelectPartner: (id: string) => void;
  className?: string;
}

export function PartnerLocationMap({
  partners,
  selectedPartnerId,
  onSelectPartner,
  className = "",
}: PartnerLocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [mapFilter, setMapFilter] = useState<"ALL" | "ONLINE" | "BUSY" | "OFFLINE">("ALL");

  // Partners with valid geographic coordinates
  const geocodedPartners = useMemo(() => {
    return partners.filter(
      (p) =>
        p.lastLocation &&
        typeof p.lastLocation.latitude === "number" &&
        typeof p.lastLocation.longitude === "number" &&
        !isNaN(p.lastLocation.latitude) &&
        !isNaN(p.lastLocation.longitude) &&
        Math.abs(p.lastLocation.latitude) > 0.001
    );
  }, [partners]);

  const filteredPartners = useMemo(() => {
    if (mapFilter === "ALL") return geocodedPartners;
    if (mapFilter === "ONLINE")
      return geocodedPartners.filter(
        (p) => p.availabilityStatus === "ONLINE" && !p.currentOrderId
      );
    if (mapFilter === "BUSY")
      return geocodedPartners.filter(
        (p) => p.availabilityStatus === "BUSY" || !!p.currentOrderId
      );
    if (mapFilter === "OFFLINE")
      return geocodedPartners.filter((p) => p.availabilityStatus === "OFFLINE");
    return geocodedPartners;
  }, [geocodedPartners, mapFilter]);

  // Load Leaflet dynamically via CDN script/CSS injection
  useEffect(() => {
    if (typeof window === "undefined") return;

    let isMounted = true;

    const loadLeaflet = async () => {
      // Check if Leaflet CSS already loaded
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      // Check if window.L is already available
      if ((window as any).L) {
        if (isMounted) setMapReady(true);
        return;
      }

      // Load Leaflet script
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.async = true;
      script.onload = () => {
        if (isMounted) setMapReady(true);
      };
      document.body.appendChild(script);
    };

    loadLeaflet();

    return () => {
      isMounted = false;
    };
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapReady || !mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    if (!mapInstanceRef.current) {
      // Default to Bengaluru Central Cloud Kitchen coordinates
      const defaultCenter = [12.9716, 77.5946];
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 12,
        zoomControl: false,
      });

      // Free, high quality OpenStreetMap tiles
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Custom Zoom Control top-right
      L.control.zoom({ position: "topright" }).addTo(map);

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mapReady]);

  // Update Markers when partners or filter change
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    const map = mapInstanceRef.current;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    const bounds = L.latLngBounds([]);

    filteredPartners.forEach((partner) => {
      const loc = partner.lastLocation;
      if (!loc) return;

      const latLng = [loc.latitude, loc.longitude];
      bounds.extend(latLng);

      const isBusy = partner.availabilityStatus === "BUSY" || !!partner.currentOrderId;
      const isOnline = partner.availabilityStatus === "ONLINE" && !isBusy;
      const isOffline = partner.availabilityStatus === "OFFLINE";
      const isLive = partner.locationFreshness === "LIVE";
      const isSelected = partner.id === selectedPartnerId;

      // Color scheme
      let markerColor = "#64748B"; // slate offline
      let badgeLabel = "OFFLINE";
      let ringEffect = "";

      if (isBusy) {
        markerColor = "#D97706"; // amber
        badgeLabel = "BUSY";
        ringEffect = "animate-ping";
      } else if (isOnline) {
        markerColor = "#059669"; // emerald
        badgeLabel = "ONLINE";
        ringEffect = "animate-ping";
      }

      // Custom HTML Marker Icon
      const iconHtml = `
        <div class="relative flex items-center justify-center cursor-pointer group" style="transform: translate(-50%, -50%);">
          ${
            (isOnline || isBusy) && isLive
              ? `<span class="${ringEffect} absolute w-8 h-8 rounded-full opacity-40" style="background-color: ${markerColor};"></span>`
              : ""
          }
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-lg border-2 ${
            isSelected ? "border-black scale-125" : "border-white"
          } transition-transform" style="background-color: ${markerColor};">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            </svg>
          </div>
          <span class="absolute -bottom-4 bg-black/80 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.2 rounded-md shadow-xs whitespace-nowrap">
            ${partner.name.split(" ")[0]}
          </span>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: "custom-partner-marker",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker(latLng, { icon: customIcon }).addTo(map);

      // Popup Content
      const popupHtml = `
        <div style="font-family: inherit; min-width: 220px; padding: 4px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <strong style="font-size: 13px; color: #1E2B1E;">${partner.name}</strong>
            <span style="font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: ${
              isBusy ? "#FEF3C7; color: #92400E;" : isOnline ? "#D1FAE5; color: #065F46;" : "#F1F5F9; color: #475569;"
            }">${badgeLabel}</span>
          </div>
          <div style="font-size: 11px; color: #64748B; margin-bottom: 6px;">
            📞 ${partner.phone}
          </div>
          <div style="display: flex; gap: 4px; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: ${
              isLive ? "#ECFDF5; color: #047857; border: 1px solid #A7F3D0;" : "#F8FAFC; color: #64748B; border: 1px solid #CBD5E1;"
            }">
              ${isLive ? "● LIVE GPS" : "○ LAST KNOWN"}
            </span>
            ${
              loc.batteryLevel !== null && loc.batteryLevel !== undefined
                ? `<span style="font-size: 10px; color: #64748B;">🔋 ${loc.batteryLevel}%</span>`
                : ""
            }
          </div>
          ${
            partner.currentOrder
              ? `<div style="font-size: 10px; background: #FFFBEB; border: 1px solid #FDE68A; padding: 4px 6px; border-radius: 6px; color: #92400E; margin-bottom: 8px;">
                  Active Delivery: #${partner.currentOrder.orderNumber}
                 </div>`
              : ""
          }
          <div style="font-size: 10px; color: #94A3B8; margin-bottom: 8px;">
            Updated: ${
              loc.updatedAt ? new Date(loc.updatedAt).toLocaleTimeString() : "Unknown"
            }
          </div>
          <button id="view-partner-btn-${partner.id}" style="width: 100%; font-size: 11px; font-weight: 700; background: #354B35; color: white; border: none; padding: 6px 10px; border-radius: 8px; cursor: pointer;">
            View Partner Details &rarr;
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml, { maxWidth: 280 });

      marker.on("popupopen", () => {
        const btn = document.getElementById(`view-partner-btn-${partner.id}`);
        if (btn) {
          btn.onclick = () => onSelectPartner(partner.id);
        }
      });

      marker.on("click", () => {
        onSelectPartner(partner.id);
      });

      markersRef.current.set(partner.id, marker);
    });

    // Auto-fit bounds if we have markers and none currently selected
    if (filteredPartners.length > 0 && !selectedPartnerId) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [filteredPartners, mapReady, onSelectPartner, selectedPartnerId]);

  // Focus on selected partner
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !selectedPartnerId) return;
    const partner = geocodedPartners.find((p) => p.id === selectedPartnerId);
    if (!partner || !partner.lastLocation) return;

    const map = mapInstanceRef.current;
    const latLng = [partner.lastLocation.latitude, partner.lastLocation.longitude];

    map.flyTo(latLng, 15, { duration: 1.2 });

    const marker = markersRef.current.get(selectedPartnerId);
    if (marker) {
      setTimeout(() => {
        marker.openPopup();
      }, 600);
    }
  }, [selectedPartnerId, geocodedPartners, mapReady]);

  return (
    <div
      className={`relative w-full rounded-3xl overflow-hidden border border-[#E5DFC5] bg-[#F7F3EA] shadow-xs flex flex-col ${className}`}
    >
      {/* Map Filter & Header Toolbar */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-wrap items-center gap-1.5 bg-white/95 backdrop-blur-md px-3 py-2 rounded-2xl shadow-md border border-[#E5DFC5]">
        <div className="flex items-center gap-1.5 mr-2 text-xs font-bold text-[#1E2B1E]">
          <Navigation className="w-3.5 h-3.5 text-[#354B35]" />
          <span>Fleet Map</span>
        </div>

        <button
          type="button"
          onClick={() => setMapFilter("ALL")}
          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
            mapFilter === "ALL"
              ? "bg-[#354B35] text-white shadow-xs"
              : "text-[#667266] hover:bg-[#F0ECE1]"
          }`}
        >
          All ({geocodedPartners.length})
        </button>

        <button
          type="button"
          onClick={() => setMapFilter("ONLINE")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
            mapFilter === "ONLINE"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-emerald-700 hover:bg-emerald-50"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Online</span>
        </button>

        <button
          type="button"
          onClick={() => setMapFilter("BUSY")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
            mapFilter === "BUSY"
              ? "bg-amber-600 text-white shadow-xs"
              : "text-amber-700 hover:bg-amber-50"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span>Busy</span>
        </button>

        <button
          type="button"
          onClick={() => setMapFilter("OFFLINE")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
            mapFilter === "OFFLINE"
              ? "bg-slate-700 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          <span>Offline</span>
        </button>
      </div>

      {/* Map Viewport */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[360px] z-0" />

      {/* Empty State Banner if no coordinates recorded */}
      {geocodedPartners.length === 0 && mapReady && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center z-10 pointer-events-none">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mb-2">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <h4 className="font-bold text-sm text-[#1E2B1E]">Awaiting Partner GPS Coordinates</h4>
          <p className="text-xs text-[#667266] max-w-sm mt-1">
            As approved delivery partners switch Online on their mobile devices, live GPS beacons and markers will appear automatically.
          </p>
        </div>
      )}

      {/* Legend Footer */}
      <div className="bg-white/95 backdrop-blur-md border-t border-[#E5DFC5] px-4 py-2 flex flex-wrap items-center justify-between text-[11px] text-[#667266] gap-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-xs" />
            <span className="font-semibold text-gray-700">Online & Available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-xs" />
            <span className="font-semibold text-gray-700">Busy (Delivering)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block shadow-xs" />
            <span className="font-semibold text-gray-700">Offline / Stale Location</span>
          </div>
        </div>
        <div className="text-[10px] text-gray-400 font-medium">
          OpenStreetMap • Live updates every 8s
        </div>
      </div>
    </div>
  );
}
