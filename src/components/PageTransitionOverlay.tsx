'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

type TenantOverride = {
  logoUrl?: string | null
  name?: string | null
  bgColor?: string | null
  showName?: boolean
}

type TransitionContextType = {
  trigger: (onComplete: () => void, delay?: number, tenant?: TenantOverride) => void
}

const TransitionContext = createContext<TransitionContextType>({ trigger: () => {} })

export function usePageTransition() {
  return useContext(TransitionContext)
}

const SAMARA_LOGO = 'https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png'
const SAMARA_NAME = 'Samara Liveaboard'
const SAMARA_BG   = '#0c2e3a'

export function PageTransitionProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false)
  const [tenant, setTenant]   = useState<TenantOverride>({})

  const trigger = useCallback((onComplete: () => void, delay = 900, t?: TenantOverride) => {
    if (t) setTenant(t)
    setVisible(true)
    setTimeout(onComplete, delay)
  }, [])

  const logo     = tenant.logoUrl  ?? SAMARA_LOGO
  const name     = tenant.name     ?? SAMARA_NAME
  const bgColor  = tenant.bgColor  ?? SAMARA_BG
  const showName = tenant.showName ?? false

  return (
    <TransitionContext.Provider value={{ trigger }}>
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            key="page-transition"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
            style={{ backgroundColor: bgColor }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.35, delay: 0.1 }}
              className="flex flex-col items-center gap-5"
            >
              <img src={logo} alt={name} className="w-14 h-14 object-contain" />

              {showName && (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 0.6, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="text-white text-[11px] tracking-[0.25em] uppercase font-light"
                >
                  {name}
                </motion.p>
              )}

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="flex gap-1.5 mt-1"
              >
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-white"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18 }}
                  />
                ))}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </TransitionContext.Provider>
  )
}
