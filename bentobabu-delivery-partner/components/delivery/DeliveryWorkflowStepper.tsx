"use client";

import React from "react";
import { Check, Clock, Package, Bike, MapPin, ShieldCheck } from "lucide-react";
import { OrderStatus } from "@/types";

interface StepperProps {
  status: OrderStatus;
}

export function DeliveryWorkflowStepper({ status }: StepperProps) {
  const steps = [
    {
      id: "READY_FOR_PICKUP",
      label: "Kitchen Pickup",
      desc: "Collect meal pack",
      icon: Package,
    },
    {
      id: "OUT_FOR_DELIVERY",
      label: "Out for Delivery",
      desc: "Heading to customer",
      icon: Bike,
    },
    {
      id: "DELIVERED",
      label: "Delivered",
      desc: "OTP verified",
      icon: ShieldCheck,
    },
  ];

  let currentStepIdx = 0;
  if (status === "OUT_FOR_DELIVERY") currentStepIdx = 1;
  if (status === "DELIVERED") currentStepIdx = 2;

  return (
    <div className="bg-white rounded-3xl p-5 border border-[#EFECE6] shadow-sm space-y-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
        Live Delivery Progress
      </div>

      <div className="relative flex items-center justify-between">
        {/* Connecting line */}
        <div className="absolute top-5 left-6 right-6 h-0.5 bg-gray-200 -z-0" />
        <div
          className="absolute top-5 left-6 h-0.5 bg-[#C86D51] transition-all duration-500 -z-0"
          style={{
            width: `${(currentStepIdx / (steps.length - 1)) * 100}%`,
          }}
        />

        {steps.map((step, idx) => {
          const isDone = idx < currentStepIdx;
          const isCurrent = idx === currentStepIdx;
          const IconComponent = step.icon;

          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center text-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                  isDone
                    ? "bg-[#C86D51] text-white shadow-xs"
                    : isCurrent
                    ? "bg-[#241C1A] text-white ring-4 ring-[#C86D51]/20 shadow-md scale-110"
                    : "bg-gray-100 text-gray-400 border border-gray-200"
                }`}
              >
                {isDone ? (
                  <Check className="w-5 h-5 stroke-[2.5]" />
                ) : (
                  <IconComponent className="w-4 h-4" />
                )}
              </div>
              <div className="mt-2 space-y-0.5">
                <div
                  className={`text-xs font-bold ${
                    isCurrent ? "text-[#241C1A]" : isDone ? "text-[#C86D51]" : "text-gray-400"
                  }`}
                >
                  {step.label}
                </div>
                <div className="text-[10px] text-gray-500 hidden sm:block">
                  {step.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
