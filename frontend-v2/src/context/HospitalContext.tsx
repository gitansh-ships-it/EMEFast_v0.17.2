"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import api from "@/lib/api";

interface HospitalContextType {
  inboxCount: number | null;
  setInboxCount: (count: number | null) => void;
  activeCount: number | null;
  setActiveCount: (count: number | null) => void;
}

const HospitalContext = createContext<HospitalContextType>({
  inboxCount: null,
  setInboxCount: () => {},
  activeCount: null,
  setActiveCount: () => {},
});

export function HospitalProvider({ children }: { children: React.ReactNode }) {
  const [inboxCount, setInboxCount] = useState<number | null>(null);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const pathname = usePathname();

  // Only poll when the user is authenticated as HOSPITAL and the dashboard/active-cases
  // pages are not already mounted and actively polling on screen.
  useEffect(() => {
    const isDashboard = pathname === "/hospital/dashboard" || pathname === "/hospital/emergencies";
    const isActiveCases = pathname === "/hospital/active-cases";

    if (isDashboard || isActiveCases) {
      // The respective page components push their fetched counts directly via context
      return;
    }

    const session = getAuthSession();
    if (session?.role !== "HOSPITAL" || !session.hospital_id) {
      return;
    }

    const hospId = session.hospital_id;

    const fetchCounts = async () => {
      try {
        const [incomingRes, activeRes] = await Promise.allSettled([
          api.get(`/hospitals/${hospId}/incoming`),
          api.get(`/hospitals/${hospId}/active-cases`),
        ]);

        if (incomingRes.status === "fulfilled" && Array.isArray(incomingRes.value.data)) {
          setInboxCount(incomingRes.value.data.length);
        }
        if (activeRes.status === "fulfilled" && Array.isArray(activeRes.value.data)) {
          setActiveCount(activeRes.value.data.length);
        }
      } catch {
        // Retain prior counts on background error
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 8000);
    return () => clearInterval(interval);
  }, [pathname]);

  return (
    <HospitalContext.Provider value={{ inboxCount, setInboxCount, activeCount, setActiveCount }}>
      {children}
    </HospitalContext.Provider>
  );
}

export function useHospital() {
  return useContext(HospitalContext);
}
