"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MonitoredPartner, CentralKitchenInfo } from "@/services/deliveryOperationsService";
import {
  MapPin,
  Clock,
  Radio,
  Navigation,
  Building2,
} from "lucide-react";

interface PartnerLocationMapProps {
  partners: MonitoredPartner[];
  selectedPartnerId: string | null;
  onSelectPartner: (id: string) => void;
  kitchen?: CentralKitchenInfo | null;
  className?: string;
}

export const VERIFIED_CENTRAL_KITCHEN: CentralKitchenInfo = {
  name: "BentoBabu Central Kitchen",
  landmark: "Apollo Pharmacy / Apollo 24|7",
  address: "Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal, India",
  pincode: "700122",
  latitude: 22.7666909,
  longitude: 88.3788318,
  googleMapsUrl: "https://www.google.com/maps?q=22.7666909,88.3788318",
  googleMapsDirectionsUrl: "https://www.google.com/maps/dir/?api=1&destination=22.7666909%2C88.3788318",
};

function getKitchenPopupHtml(kitchen: CentralKitchenInfo, coords: [number, number]) {
  return `
    <div style="font-family: inherit; min-width: 240px; padding: 6px;">
      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
        <span style="background: #354B35; color: #DFC89B; font-weight: 800; font-size: 10px; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Central Kitchen</span>
      </div>
      <div style="font-weight: 800; font-size: 13px; color: #1E2B1E; margin-bottom: 2px;">
        ${kitchen.name || "BentoBabu Central Kitchen"}
      </div>
      <div style="font-size: 11px; font-weight: 600; color: #C86D51; margin-bottom: 4px;">
        Landmark: ${kitchen.landmark || "Apollo Pharmacy / Apollo 24|7"}
      </div>
      <div style="font-size: 11px; color: #64748B; margin-bottom: 6px; line-height: 1.35;">
        ${kitchen.address || "Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal, India"} - ${kitchen.pincode || "700122"}
      </div>
      <div style="font-size: 10px; color: #94A3B8; font-family: monospace; margin-bottom: 8px;">
        Coordinates: ${coords[0].toFixed(7)}, ${coords[1].toFixed(7)}
      </div>
      <a href="https://www.google.com/maps?q=${coords[0]},${coords[1]}" target="_blank" rel="noopener noreferrer" style="display: block; text-align: center; font-size: 11px; font-weight: 700; background: #354B35; color: white; text-decoration: none; padding: 6px 10px; border-radius: 6px;">
        Open in Google Maps &rarr;
      </a>
    </div>
  `;
}

export function PartnerLocationMap({
  partners,
  selectedPartnerId,
  onSelectPartner,
  kitchen,
  className = "",
}: PartnerLocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const kitchenMarkerRef = useRef<L.Marker | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const initialFitDoneRef = useRef(false);

  const activeKitchen = kitchen || VERIFIED_CENTRAL_KITCHEN;
  const kitchenCoords = useMemo<[number, number]>(() => {
    const lat = typeof activeKitchen.latitude === "number" && isFinite(activeKitchen.latitude)
      ? activeKitchen.latitude
      : 22.7666909;
    const lng = typeof activeKitchen.longitude === "number" && isFinite(activeKitchen.longitude)
      ? activeKitchen.longitude
      : 88.3788318;
    return [lat, lng];
  }, [activeKitchen.latitude, activeKitchen.longitude]);

  const [mapReady, setMapReady] = useState(false);
  const [mapFilter, setMapFilter] = useState<"ALL" | "ONLINE" | "BUSY" | "OFFLINE">("ALL");

  // Partners with valid, finite geographic coordinates
  const geocodedPartners = useMemo(() => {
    return partners.filter(
      (p) =>
        p.lastLocation &&
        typeof p.lastLocation.latitude === "number" &&
        typeof p.lastLocation.longitude === "number" &&
        !isNaN(p.lastLocation.latitude) &&
        !isNaN(p.lastLocation.longitude) &&
        isFinite(p.lastLocation.latitude) &&
        isFinite(p.lastLocation.longitude) &&
        p.lastLocation.latitude >= -90 &&
        p.lastLocation.latitude <= 90 &&
        p.lastLocation.longitude >= -180 &&
        p.lastLocation.longitude <= 180 &&
        (Math.abs(p.lastLocation.latitude) > 0.0001 || Math.abs(p.lastLocation.longitude) > 0.0001)
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

  // Initialize Map directly on mount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Check if container already had a Leaflet instance attached to prevent double-initialization
      const container = mapContainerRef.current as any;
      if (container._leaflet_id) {
        delete container._leaflet_id;
      }

      const map = L.map(mapContainerRef.current, {
        center: kitchenCoords,
        zoom: 14,
        zoomControl: false,
      });

      // Free, high quality OpenStreetMap tiles
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Custom Zoom Control top-right
      L.control.zoom({ position: "topright" }).addTo(map);

      // Add Central Cloud Kitchen Hub Marker
      const kitchenIconHtml = `
        <div class="relative flex items-center justify-center cursor-pointer" style="transform: translate(-50%, -50%);">
          <span class="animate-pulse absolute w-10 h-10 rounded-full bg-[#354B35]/30"></span>
          <div class="w-10 h-10 rounded-2xl bg-[#354B35] text-[#DFC89B] flex items-center justify-center shadow-xl border-2 border-white font-bold text-sm">
            B
          </div>
          <span class="absolute -bottom-4 bg-[#354B35] text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
            Kitchen Hub
          </span>
        </div>
      `;

      const kitchenIcon = L.divIcon({
        html: kitchenIconHtml,
        className: "custom-kitchen-marker",
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      const kitchenMarker = L.marker(kitchenCoords, {
        icon: kitchenIcon,
        zIndexOffset: 1000,
      }).addTo(map);

      kitchenMarker.bindPopup(getKitchenPopupHtml(activeKitchen, kitchenCoords), { maxWidth: 320 });

      kitchenMarkerRef.current = kitchenMarker;
      mapInstanceRef.current = map;
      setMapReady(true);

      // Invalidate size once container layout stabilizes
      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }

    // ResizeObserver ensures map tiles layout properly on split/map toggle or window resize
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });

    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        kitchenMarkerRef.current = null;
        markersRef.current.clear();
      }
    };
  }, [kitchenCoords]);

  // Sync kitchen marker if kitchen details or coordinates update
  useEffect(() => {
    if (!mapReady || !kitchenMarkerRef.current) return;
    kitchenMarkerRef.current.setLatLng(kitchenCoords);
    kitchenMarkerRef.current.setPopupContent(getKitchenPopupHtml(activeKitchen, kitchenCoords));
  }, [kitchenCoords, activeKitchen, mapReady]);

  // Update Markers incrementally when partners or filter change
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    const currentPartnerIds = new Set<string>();
    const bounds = L.latLngBounds([kitchenCoords]);

    filteredPartners.forEach((partner) => {
      const loc = partner.lastLocation;
      if (!loc || typeof loc.latitude !== "number" || typeof loc.longitude !== "number") return;

      currentPartnerIds.add(partner.id);
      const latLng: [number, number] = [loc.latitude, loc.longitude];
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
          <span class="absolute -bottom-4 bg-black/80 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.2 rounded-md shadow-xs whitespace-nowrap pointer-events-none">
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

      if (markersRef.current.has(partner.id)) {
        // Move existing marker smoothly without flicker
        const existingMarker = markersRef.current.get(partner.id)!;
        existingMarker.setLatLng(latLng);
        existingMarker.setIcon(customIcon);
        existingMarker.setPopupContent(popupHtml);
      } else {
        // Add new marker
        const newMarker = L.marker(latLng, { icon: customIcon }).addTo(map);
        newMarker.bindPopup(popupHtml, { maxWidth: 280 });

        newMarker.on("popupopen", () => {
          const btn = document.getElementById(`view-partner-btn-${partner.id}`);
          if (btn) {
            btn.onclick = () => onSelectPartner(partner.id);
          }
        });

        newMarker.on("click", () => {
          onSelectPartner(partner.id);
        });

        markersRef.current.set(partner.id, newMarker);
      }
    });

    // Remove markers that are no longer in filtered list or lost coordinates
    markersRef.current.forEach((marker, id) => {
      if (!currentPartnerIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Auto-fit bounds on initial load if we have markers and none currently selected
    if (!initialFitDoneRef.current && filteredPartners.length > 0 && !selectedPartnerId) {
      initialFitDoneRef.current = true;
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [filteredPartners, mapReady, onSelectPartner, selectedPartnerId]);

  // Focus on selected partner
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !selectedPartnerId) return;
    const partner = geocodedPartners.find((p) => p.id === selectedPartnerId);
    if (!partner || !partner.lastLocation) return;

    const map = mapInstanceRef.current;
    const latLng: [number, number] = [partner.lastLocation.latitude, partner.lastLocation.longitude];

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

      {/* Non-intrusive Floating Notice when no partners have transmitted GPS beacons yet */}
      {geocodedPartners.length === 0 && mapReady && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md border border-[#E5DFC5] shadow-lg rounded-2xl px-4 py-2.5 flex items-center gap-2.5 z-[1000] max-w-sm text-center">
          <Radio className="w-4 h-4 text-amber-600 animate-pulse shrink-0" />
          <span className="text-[11px] font-semibold text-[#1E2B1E]">
            Awaiting partner GPS beacons. Centered on BentoBabu Central Kitchen (Barrackpore).
          </span>
        </div>
      )}

      {/* Legend Footer */}
      <div className="bg-white/95 backdrop-blur-md border-t border-[#E5DFC5] px-4 py-2 flex flex-wrap items-center justify-between text-[11px] text-[#667266] gap-2 z-[1000]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#354B35] inline-block shadow-xs" />
            <span className="font-semibold text-gray-700">Central Kitchen Hub</span>
          </div>
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
            <span className="font-semibold text-gray-700">Offline / Last Known</span>
          </div>
        </div>
        <div className="text-[10px] text-gray-400 font-medium">
          OpenStreetMap • Live updates every 8s
        </div>
      </div>
    </div>
  );
}
