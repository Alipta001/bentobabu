import { authApi } from "./auth.api";
import { User } from "@/types";

export const profileApi = {
  async getProfile(): Promise<User | null> {
    return authApi.getMe();
  },

  async updateProfile(updates: { name?: string; phone?: string }): Promise<User> {
    return authApi.updateProfile(updates);
  },

  getVehicleDetails(): {
    vehicleType: string;
    model: string;
    vehicleNumber: string;
    drivingLicenseNumber: string;
    verificationStatus: "VERIFIED" | "PENDING";
  } {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("bb_delivery_vehicle");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {}
      }
    }

    return {
      vehicleType: "Two Wheeler (Electric Scooter)",
      model: "Ather 450X Gen 3",
      vehicleNumber: "KA 01 EK 4921",
      drivingLicenseNumber: "KA-0120200049281",
      verificationStatus: "VERIFIED",
    };
  },

  saveVehicleDetails(details: {
    vehicleType: string;
    model: string;
    vehicleNumber: string;
    drivingLicenseNumber: string;
  }) {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "bb_delivery_vehicle",
        JSON.stringify({
          ...details,
          verificationStatus: "VERIFIED",
        })
      );
    }
  },
};
