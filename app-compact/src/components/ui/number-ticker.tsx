import { useEffect, useMemo, useRef, type ComponentPropsWithoutRef } from "react"
import { useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react"

import { cn } from "@/lib/cn"

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number
  startValue?: number
  direction?: "up" | "down"
  delay?: number
  decimalPlaces?: number
  prefix?: string
  suffix?: string
}

export function NumberTicker({
  value,
  startValue = 0,
  direction = "up",
  delay = 0,
  className,
  decimalPlaces = 0,
  prefix = "",
  suffix = "",
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null)
  // Ticking only rewrites textContent — no compositing layers — so it's cheap enough
  // to keep on mobile/WebView; only the OS-level reduced-motion preference disables it.
  const reducedMotion = useReducedMotion() ?? false
  const motionValue = useMotionValue(direction === "down" ? value : startValue)
  // Snappy settle (~1s even for 5-digit values): sluggish tickers read as lag,
  // and UI smokes assert on the final text within a few seconds.
  const springValue = useSpring(motionValue, {
    damping: 42,
    stiffness: 320,
  })
  const isInView = useInView(ref, { once: true, margin: "0px" })
  const formatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      }),
    [decimalPlaces],
  )
  const formattedValue = useMemo(
    () => formatter.format(Number(value.toFixed(decimalPlaces))),
    [formatter, value, decimalPlaces],
  )

  useEffect(() => {
    if (reducedMotion) return

    let timer: ReturnType<typeof setTimeout> | null = null

    if (isInView) {
      timer = setTimeout(() => {
        motionValue.set(direction === "down" ? startValue : value)
      }, delay * 1000)
    }

    return () => {
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [motionValue, isInView, delay, value, direction, startValue, reducedMotion])

  useEffect(() => {
    const unsubscribe = springValue.on("change", (latest) => {
      if (!ref.current || reducedMotion) return
      ref.current.textContent = `${prefix}${formatter.format(Number(latest.toFixed(decimalPlaces)))}${suffix}`
    })

    return unsubscribe
  }, [springValue, decimalPlaces, formatter, prefix, suffix, reducedMotion])

  return (
    <span
      ref={ref}
      className={cn(
        "inline-block tabular-nums tracking-[0.015em] text-[color:var(--navy)]",
        className,
      )}
      {...props}
    >
      {reducedMotion
        ? `${prefix}${formattedValue}${suffix}`
        : `${prefix}${direction === "down" ? value : startValue}${suffix}`}
    </span>
  )
}
