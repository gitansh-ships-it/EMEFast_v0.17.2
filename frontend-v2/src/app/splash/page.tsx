"use client";

import { useRouter } from "next/navigation";
import SplashScreen from "@/components/SplashScreen";

export default function SplashPage() {
  const router = useRouter();

  return (
    <SplashScreen
      durationMs={2800}
      onComplete={() => {
        router.push("/ambulance/dashboard");
      }}
    />
  );
}
