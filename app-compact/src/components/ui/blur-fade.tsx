"use client"

import { useEffect, useRef, useState } from "react"
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  type MotionProps,
  type UseInViewOptions,
  type Variants,
} from "motion/react"
import { shouldDisableHeavyEffects } from "../../lib/performance"
import { cn } from "../../lib/cn"

type MarginType = UseInViewOptions["margin"]

interface BlurFadeProps extends MotionProps {
  children: React.ReactNode
  className?: string
  variant?: {
    hidden: { y: number }
    visible: { y: number }
  }
  duration?: number
  delay?: number
  offset?: number
  direction?: "up" | "down" | "left" | "right"
  inView?: boolean
  inViewMargin?: MarginType
  blur?: string
}

const getFilter = (v: Variants[string]) =>
  typeof v === "function" ? undefined : v.filter

export function BlurFade({
  children,
  className,
  variant,
  duration = 0.4,
  delay = 0,
  offset = 6,
  direction = "down",
  inView = false,
  inViewMargin = "-50px",
  blur = "6px",
  ...props
}: BlurFadeProps) {
  const ref = useRef(null)
  const reducedMotion = useReducedMotion() ?? false
  const disableHeavy = shouldDisableHeavyEffects()
  const inViewResult = useInView(ref, { once: true, margin: inViewMargin })
  // Content visibility must never be hostage to IntersectionObserver delivery:
  // occluded surfaces and some Android WebView states throttle IO to never-fires,
  // which left whole tabs (scan/dashboard/timeline/...) parked at opacity 0.
  // If IO hasn't fired shortly after mount, force the reveal.
  const [forceVisible, setForceVisible] = useState(false)
  useEffect(() => {
    if (!inView || inViewResult || forceVisible) return
    const t = window.setTimeout(() => setForceVisible(true), 700)
    return () => window.clearTimeout(t)
  }, [inView, inViewResult, forceVisible])
  const isInView = !inView || inViewResult || forceVisible

  const defaultVariants: Variants = {
    hidden: {
      [direction === "left" || direction === "right" ? "x" : "y"]:
        reducedMotion ? 0 : direction === "right" || direction === "down" ? -offset : offset,
      opacity: 0,
      filter: (reducedMotion || disableHeavy) ? "blur(0px)" : `blur(${blur})`,
    },
    visible: {
      [direction === "left" || direction === "right" ? "x" : "y"]: 0,
      opacity: 1,
      filter: `blur(0px)`,
    },
  }
  const combinedVariants = variant ?? defaultVariants

  const hiddenFilter = getFilter(combinedVariants.hidden)
  const visibleFilter = getFilter(combinedVariants.visible)

  const shouldTransitionFilter =
    hiddenFilter != null &&
    visibleFilter != null &&
    hiddenFilter !== visibleFilter &&
    !disableHeavy

  return (
    <AnimatePresence>
      <motion.div
        ref={ref}
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        exit="hidden"
        variants={combinedVariants}
        transition={{
          delay: 0.04 + delay,
          duration: reducedMotion ? 0.01 : duration,
          ease: "easeOut",
          ...(shouldTransitionFilter && !reducedMotion && !disableHeavy ? { filter: { duration } } : {}),
        }}
        // blur-fade-forced is a CSS !important escape hatch: it beats motion's inline
        // styles without rAF, so content still appears when the surface is occluded
        // (hidden pages freeze rAF — motion can never animate opacity 0 → 1 there).
        className={cn(className, forceVisible && !inViewResult && "blur-fade-forced")}
        {...props}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
