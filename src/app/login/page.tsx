"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { usePageTransition } from "@/components/PageTransitionOverlay";

export default function LoginPage() {
  const router = useRouter();
  const { trigger } = usePageTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setLoading(false);
      setError("Incorrect email or password. Please try again.");
      return;
    }

    trigger(() => { window.location.href = "/"; });
  };

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@700&display=swap');`}</style>

      <div
        className="relative flex max-h-screen w-full overflow-hidden"
        style={{
          backgroundImage:
            "url('https://samaraliveaboard.com/wp-content/uploads/2025/07/samara-1-main-deck-4.webp')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* White overlay */}
        <div className="absolute inset-0 bg-white/98 z-0" />

        {/* Main content */}
        <div className="relative z-10 flex w-full max-h-screen h-screen">

          {/* ── LEFT PANEL ── */}
          <div className="flex flex-col w-full md:w-[52%] h-auto md:h-screen px-6 sm:px-10 md:px-12 pt-6 sm:pt-8 pb-6 sm:pb-7">

            {/* Logo */}
            <img
              src="https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png.webp"
              alt="Samara Logo"
              className="h-9 sm:h-11 w-auto object-contain object-left mx-auto md:mx-0"
            />

            {/* Form */}
            <form
              onSubmit={handleLogin}
              className="flex flex-col justify-center flex-1 w-full max-w-sm mx-auto py-8 sm:py-10"
            >
              <h1
                className="text-2xl sm:text-3xl font-bold tracking-[0.07em] text-center text-[#1b3a4b] mb-2"
                style={{ fontFamily: "'Merriweather', serif" }}
              >
                WELCOME BACK!
              </h1>
              <p className="text-xs sm:text-[13px] text-center text-[#7e9099] font-light mb-7 leading-relaxed">
                Sign in to manage itineraries and client bookings.
              </p>

              {/* Error message */}
              {error && (
                <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-600">
                  {error}
                </div>
              )}

              {/* Email */}
              <div className="mb-4">
                <label className="block text-[13px] font-semibold text-[#3c5462] mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="Input your Email..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-transparent rounded-md border border-[#cdd8df] px-4 py-3 text-[13px] text-[#2a3d4a] placeholder:text-[#b0bfc8] placeholder:italic placeholder:font-light outline-none focus:border-[#1a6070] transition-colors"
                />
              </div>

              {/* Password */}
              <div className="mb-1">
                <label className="block text-[13px] font-semibold text-[#3c5462] mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="Input your Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-transparent rounded-md border border-[#cdd8df] px-4 py-3 text-[13px] text-[#2a3d4a] placeholder:text-[#b0bfc8] placeholder:italic placeholder:font-light outline-none focus:border-[#1a6070] transition-colors"
                />
              </div>

              {/* Button */}
              <button
                type="submit"
                disabled={loading}
                className="mt-6 py-3.5 w-full sm:w-[70%] rounded-md mx-auto block bg-[#1a5f6e] hover:bg-[#145260] active:bg-[#0f3f4a] disabled:opacity-60 disabled:cursor-not-allowed text-white text-[13px] font-semibold tracking-wide transition-colors cursor-pointer"
              >
                {loading ? "Logging in..." : "Log In to Dashboard"}
              </button>

              {/* Forgot */}
              <p className="mt-4 text-center text-[12px] text-[#8fa3ad]">
                Forgot password?{" "}
                <span className="text-[#8fa3ad] underline cursor-pointer hover:text-[#1a6070] transition-colors">
                  Try to Remember
                </span>
              </p>
            </form>

            {/* Footer */}
            <p className="text-[10.5px] text-[#aabbc4] font-light text-center md:text-left">
              © 2026 Samara Liveaboard. All rights reserved.
            </p>
          </div>

          {/* ── RIGHT PANEL — hidden on mobile, visible md+ ── */}
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
    </>
  );
}
