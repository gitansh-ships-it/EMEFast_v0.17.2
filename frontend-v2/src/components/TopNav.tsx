"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Siren,
  Ambulance,
  Building2,
  Settings2,
  LayoutGrid,
  Activity,
  Hospital as HospitalIcon,
  Layers,
  LayoutDashboard,
  Users,
} from "lucide-react";
import { useState, useEffect } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { useHospital } from "@/context/HospitalContext";
import { getAuthSession, AuthSession } from "@/lib/auth";

interface TopNavProps {
  role?: "USER" | "HOSPITAL" | "ADMIN";
}

export default function TopNav({ role = "USER" }: TopNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [session, setSession] = useState<AuthSession | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSession(getAuthSession());
  }, [pathname]);

  const isHospital = pathname?.startsWith("/hospital");
  const isAdmin = pathname?.startsWith("/admin");
  const isAmbulance = pathname?.startsWith("/ambulance") || pathname?.startsWith("/user");
  const isWizard = pathname?.includes("/emergency/new");
  const isEmergencyFlow =
    pathname?.includes("/emergency") ||
    pathname?.includes("/user/hospitals") ||
    pathname?.includes("/user/navigation");
  const activeRole = isAdmin ? "ADMIN" : isHospital ? "HOSPITAL" : isAmbulance ? "USER" : role;

  // Real-time counts lifted to HospitalContext (zero duplicate polling)
  const { inboxCount, activeCount } = useHospital();

  // Determine context navigation tabs per active workspace
  const contextTabs =
    activeRole === "USER"
      ? [
          {
            label: "Overview",
            href: "/ambulance/dashboard",
            icon: LayoutGrid,
            active:
              pathname === "/" ||
              pathname === "/ambulance/dashboard" ||
              pathname === "/user/dashboard" ||
              pathname?.startsWith("/ambulance/emergency") ||
              pathname?.startsWith("/user/emergency") ||
              pathname === "/user/navigation",
          },
          {
            label: "Cases",
            href: "/user/history",
            icon: Activity,
            active: pathname === "/user/history" || pathname?.startsWith("/user/history/"),
          },
          {
            label: "Hospitals",
            href: "/user/hospitals",
            icon: HospitalIcon,
            active: pathname === "/user/hospitals" || pathname?.startsWith("/user/hospitals/"),
          },
        ]
      : activeRole === "HOSPITAL"
      ? [
          {
            label: "Inbox",
            href: "/hospital/dashboard",
            icon: Activity,
            count: inboxCount,
            active:
              pathname === "/hospital/dashboard" ||
              pathname === "/hospital/emergencies" ||
              pathname?.startsWith("/hospital/emergency"),
          },
          {
            label: "Active cases",
            href: "/hospital/active-cases",
            icon: Siren,
            count: activeCount,
            active: pathname === "/hospital/active-cases" || pathname?.startsWith("/hospital/active-cases/"),
          },
          {
            label: "Resources",
            href: "/hospital/resources",
            icon: Layers,
            active: pathname === "/hospital/resources" || pathname?.startsWith("/hospital/resources/"),
          },
        ]
      : [
          {
            label: "Command",
            href: "/admin/dashboard",
            icon: LayoutDashboard,
            active: pathname === "/admin/dashboard" || pathname === "/admin/settings",
          },
          {
            label: "Hospitals",
            href: "/admin/hospitals",
            icon: HospitalIcon,
            active: pathname === "/admin/hospitals" || pathname?.startsWith("/admin/hospitals/"),
          },
          {
            label: "Emergencies",
            href: "/admin/emergencies",
            icon: Siren,
            active: pathname === "/admin/emergencies" || pathname?.startsWith("/admin/emergencies/"),
          },
          {
            label: "Users",
            href: "/admin/users",
            icon: Users,
            active: pathname === "/admin/users" || pathname?.startsWith("/admin/users/"),
          },
        ];

  return (
    <>
      {/* SVG Liquid Refraction Progressive Enhancement */}
      <svg className="sr-only" aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        <defs>
          <filter id="liquid-refraction" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <header className="reimagined-header-root glass">
        {/* LEVEL 1 — TOP BAR (50-52px): visually quiet, merges with page */}
        <div className="reimagined-top-bar">
          <div className="reimagined-top-inner">
            {/* Left: Brand Logo & Wordmark */}
            <Link href="/" className="reimagined-brand-link" aria-label="EMEFast Home">
              <span className="reimagined-brand-icon brand-logo-badge" aria-hidden="true">
                <Image
                  src="/app-logo.png"
                  alt="EMEFast"
                  width={30}
                  height={30}
                  priority
                  className="reimagined-brand-logo-img"
                />
              </span>
              <span className="reimagined-brand-wordmark">
                <span className="brand-eme">EME</span>
                <span className="brand-fast">Fast</span>
              </span>
            </Link>

            {/* Right Actions: Authenticated vs Logged-Out */}
            <div className="reimagined-top-actions">
              <ThemeToggle />
              {(!session) ? (
                <>
                  <Link
                    href="/user/emergency/new"
                    className="reimagined-sos-btn pure-liquid-sos header-sos-btn"
                    aria-label="Start emergency intake"
                  >
                    <Siren size={12} strokeWidth={2.4} />
                    <span className="hidden sm:inline">Start Emergency</span>
                    <span className="sm:hidden">Emergency</span>
                  </Link>
                  <Link
                    href="/login"
                    className="glass px-3.5 py-1.5 rounded-full text-xs font-semibold text-[var(--text)] hover:text-white transition-colors"
                  >
                    Sign In
                  </Link>
                </>
              ) : (
                <>
                  {activeRole !== "HOSPITAL" && activeRole !== "ADMIN" && (
                    <Link
                      href="/user/emergency/new"
                      className="reimagined-sos-btn pure-liquid-sos header-sos-btn"
                      aria-label="Start emergency intake"
                    >
                      <Siren size={12} strokeWidth={2.4} />
                      <span className="hidden sm:inline">Start Emergency</span>
                      <span className="sm:hidden">Emergency</span>
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      localStorage.removeItem("emefast_token");
                      localStorage.removeItem("emefast_role");
                      localStorage.removeItem("emefast_hospital_id");
                      localStorage.removeItem("emefast_user_name");
                      setSession(null);
                      router.push("/login");
                    }}
                    className="glass px-2.5 py-1 rounded-full text-[11px] font-mono text-[var(--muted)] hover:text-white transition-colors"
                    title="Sign Out"
                  >
                    Sign Out
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* LEVEL 2 — WORKSPACE SWITCHER (Only shown after authentication and hidden on mobile emergency flow) */}
        {session && !isEmergencyFlow && (
          <div className="top-workspace-container">
            <div className="top-workspace-pill glass">
              <div className="workspace-segment-row" role="tablist" aria-label="Workspaces">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeRole === "USER"}
                  aria-label="Ambulance workspace"
                  className={`workspace-segment-tab ${activeRole === "USER" ? "active" : ""}`}
                  onClick={() => router.push("/ambulance/dashboard")}
                >
                  <Ambulance size={14} strokeWidth={2.2} className="segment-icon" />
                  <span>Ambulance</span>
                </button>
                <span className="workspace-divider" aria-hidden="true" />
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeRole === "HOSPITAL"}
                  aria-label="Hospital workspace"
                  className={`workspace-segment-tab ${activeRole === "HOSPITAL" ? "active" : ""}`}
                  onClick={() => router.push("/hospital/dashboard")}
                >
                  <Building2 size={14} strokeWidth={2.2} className="segment-icon" />
                  <span>Hospital</span>
                </button>
                <span className="workspace-divider" aria-hidden="true" />
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeRole === "ADMIN"}
                  aria-label="Admin workspace"
                  className={`workspace-segment-tab ${activeRole === "ADMIN" ? "active" : ""}`}
                  onClick={() => router.push("/admin/dashboard")}
                >
                  <Settings2 size={14} strokeWidth={2.2} className="segment-icon" />
                  <span>Admin</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* LEVEL 3 — FLOATING BOTTOM NAVIGATION DOCK (Hidden during emergency/navigation workflow) */}
      {session && !isWizard && !isEmergencyFlow && (
        <aside className="floating-bottom-liquid-dock" aria-label="Page Navigation">
          <nav className="bottom-dock-island bottom-nav glass" aria-label="Section navigation">
            <div className="context-nav-row" role="tablist">
              {contextTabs.map((tab) => {
                const TabIcon = tab.icon;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    role="tab"
                    aria-selected={tab.active}
                    className={`context-nav-item ${tab.active ? "active" : ""}`}
                  >
                    <TabIcon size={16} strokeWidth={2.2} className="context-item-icon" />
                    <span className="context-item-label">{tab.label}</span>
                    {typeof tab.count === "number" && tab.count > 0 && (
                      <span className="context-badge" aria-label={`${tab.count} items`}>
                        {tab.count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>
        </aside>
      )}
    </>
  );
}
