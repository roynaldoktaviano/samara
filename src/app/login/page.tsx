"use client";

import { useState, useEffect, useRef } from "react";
import { signIn, getSession } from "next-auth/react";
import { getTenantBranding } from "@/lib/tenant-branding";
import { usePageTransition } from "@/components/PageTransitionOverlay";

const SAMARA_LOGO = "https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png.webp";

interface TenantInfo {
  tenantName: string;
  logoUrl: string | null;
  slug: string;
}

interface TenantOption {
  tenantId: string | null;
  tenantName: string;
  tenantSlug: string;
  logoUrl: string | null;
}

export default function LoginPage() {
  const { trigger } = usePageTransition();
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [tenant, setTenant]       = useState<TenantInfo | null>(null);

  // Multi-tenant picker state
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [showPicker, setShowPicker]       = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Lookup tenant branding info when email changes (debounced 600ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!email || !email.includes("@")) { setTenant(null); return; }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/auth/tenant-info?email=${encodeURIComponent(email)}`);
      if (res.ok) setTenant(await res.json());
      else setTenant(null);
    }, 600);
  }, [email]);

  const logoUrl = tenant?.logoUrl ?? SAMARA_LOGO;
  const logoAlt = tenant?.tenantName ?? "Samara";

  async function doLogin(tenantId?: string | null) {
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      ...(tenantId !== undefined ? { tenantId: tenantId ?? "" } : {}),
      redirect: false,
    });

    if (result?.error) {
      setLoading(false);
      setError("Incorrect email or password. Please try again.");
      return;
    }

    const session = await getSession();
    const dest = session?.user?.isSuperAdmin ? "/super-admin" : "/";
    const branding = getTenantBranding(session?.user?.tenantSlug);
    trigger(() => { window.location.href = dest; }, 900, branding);
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setShowPicker(false);

    // Check how many tenants this email+password combo matches
    const res = await fetch("/api/auth/check-tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      setLoading(false);
      setError("Something went wrong. Please try again.");
      return;
    }

    const { tenants }: { tenants: TenantOption[] } = await res.json();

    if (tenants.length === 0) {
      setLoading(false);
      setError("Incorrect email or password. Please try again.");
      return;
    }

    if (tenants.length === 1) {
      // Super admin has no tenantId — NextAuth handles via central DB directly
      const isSuperAdmin = tenants[0].tenantSlug === 'super-admin';
      await doLogin(isSuperAdmin ? undefined : tenants[0].tenantId);
      return;
    }

    // Multiple matches — show picker
    setLoading(false);
    setTenantOptions(tenants);
    setShowPicker(true);
  };

  const handlePickTenant = async (option: TenantOption) => {
    setShowPicker(false);
    const isSuperAdmin = option.tenantSlug === 'super-admin';
    await doLogin(isSuperAdmin ? undefined : option.tenantId);
  };

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@700&display=swap');`}</style>

      <div
        className="relative flex max-h-screen w-full overflow-hidden"
        style={{
          backgroundImage: "url('https://samaraliveaboard.com/wp-content/uploads/2025/07/samara-1-main-deck-4.webp')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-white/98 z-0" />

        <div className="relative z-10 flex w-full max-h-screen h-screen">

          {/* ── LEFT PANEL ── */}
          <div className="flex flex-col w-full md:w-[52%] h-full md:h-screen px-0 md:px-12 pt-0 md:pt-8 pb-0 md:pb-7">

            {/* Form */}
            <form
              onSubmit={handleLogin}
              className="flex flex-col justify-center flex-1 w-full max-w-sm mx-auto px-8 py-10 md:px-0 md:py-8"
            >

              <h1
                className="text-2xl sm:text-3xl font-bold tracking-[0.07em] text-center text-[#1b3a4b] mb-2"
                style={{ fontFamily: "'Merriweather', serif" }}
              >
                WELCOME BACK!
              </h1>
              <p className="text-xs sm:text-[13px] text-center text-[#7e9099] font-light mb-7 leading-relaxed">
                {tenant ? `Sign in to ${tenant.tenantName}` : "Sign in to manage itineraries and client bookings."}
              </p>

              {error && (
                <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-600">
                  {error}
                </div>
              )}

              <div className="mb-4">
                <label className="block text-[13px] font-semibold text-[#3c5462] mb-1.5">Email</label>
                <input
                  type="email"
                  placeholder="Input your Email..."
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setShowPicker(false); }}
                  required
                  className="w-full bg-transparent rounded-md border border-[#cdd8df] px-4 py-3 text-[13px] text-[#2a3d4a] placeholder:text-[#b0bfc8] placeholder:italic placeholder:font-light outline-none focus:border-[#1a6070] transition-colors"
                />
              </div>

              <div className="mb-1">
                <label className="block text-[13px] font-semibold text-[#3c5462] mb-1.5">Password</label>
                <input
                  type="password"
                  placeholder="Input your Password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setShowPicker(false); }}
                  required
                  className="w-full bg-transparent rounded-md border border-[#cdd8df] px-4 py-3 text-[13px] text-[#2a3d4a] placeholder:text-[#b0bfc8] placeholder:italic placeholder:font-light outline-none focus:border-[#1a6070] transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-6 py-3.5 w-full sm:w-[70%] rounded-md mx-auto block bg-[#1a5f6e] hover:bg-[#145260] active:bg-[#0f3f4a] disabled:opacity-60 disabled:cursor-not-allowed text-white text-[13px] font-semibold tracking-wide transition-colors cursor-pointer"
              >
                {loading ? "Logging in..." : "Log In to Dashboard"}
              </button>

              <p className="mt-4 text-center text-[12px] text-[#8fa3ad]">
                Forgot password?{" "}
                <span className="text-[#8fa3ad] underline cursor-pointer hover:text-[#1a6070] transition-colors">
                  Try to Remember
                </span>
              </p>
            </form>

            <p className="text-[10.5px] text-[#aabbc4] font-light text-center md:text-left px-8 pb-5 md:px-0 md:pb-0">
              © 2026 Samara Liveaboard. All rights reserved.
            </p>
          </div>

          {/* ── RIGHT PANEL ── */}

          <div className="hidden md:flex flex-1 p-5">
            <div className="w-[90%] ml-auto h-full rounded-2xl overflow-hidden shadow-xl">
              <img
                src="https://otiumyacht.com/wp-content/uploads/2026/01/otium-2-1.webp"
                alt="Luxury yacht aerial view"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

        </div>
      </div>

      {/* ── Tenant picker modal ── */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center mb-5">
              <div className="text-lg font-bold text-[#1b3a4b] mb-1" style={{ fontFamily: "'Merriweather', serif" }}>
                Pilih Sistem
              </div>
              <p className="text-[12px] text-[#7e9099]">
                Akun ini terdaftar di beberapa sistem. Mau masuk ke mana?
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              {tenantOptions.map((opt) => (
                <button
                  key={opt.tenantSlug}
                  type="button"
                  onClick={() => handlePickTenant(opt)}
                  className="flex items-center gap-4 w-full border border-[#cdd8df] hover:border-[#1a6070] hover:bg-[#f0f7f9] rounded-xl px-4 py-3.5 text-left transition-all group"
                >
                  <div className="w-10 h-10 flex items-center justify-center shrink-0">
                    <img
                      src={opt.logoUrl ?? SAMARA_LOGO}
                      alt={opt.tenantName}
                      className="h-8 w-auto object-contain"
                    />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-[#1b3a4b] group-hover:text-[#1a6070] transition-colors">
                      {opt.tenantName}
                    </div>
                    <div className="text-[11px] text-[#aabbc4]">/{opt.tenantSlug}</div>
                  </div>
                  <svg className="ml-auto w-4 h-4 text-[#cdd8df] group-hover:text-[#1a6070] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="mt-4 w-full text-center text-[12px] text-[#aabbc4] hover:text-[#7e9099] transition-colors"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </>
  );
}
