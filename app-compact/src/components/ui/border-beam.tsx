import { useReducedMotion } from "motion/react"

import { cn } from "@/lib/cn"
import { shouldDisableHeavyEffects } from "../../lib/performance"

interface BorderBeamProps {
  /**
   * The size of the border beam.
   */
  size?: number
  /**
   * The duration of the border beam.
   */
  duration?: number
  /**
   * The delay of the border beam.
   */
  delay?: number
  /**
   * The color of the border beam from.
   */
  colorFrom?: string
  /**
   * The color of the border beam to.
   */
  colorTo?: string
  /**
   * The motion transition of the border beam.
   */
  transition?: Record<string, unknown>
  /**
   * The class name of the border beam.
   */
  className?: string
  /**
   * The style of the border beam.
   */
  style?: React.CSSProperties
  /**
   * Whether to reverse the animation direction.
   */
  reverse?: boolean
  /**
   * The initial offset position (0-100).
   */
  initialOffset?: number
  /**
   * The border width of the beam.
   */
  borderWidth?: number
}

export const BorderBeam = ({
  className,
  size = 50,
  delay = 0,
  duration = 8,
  colorFrom = "#d94132",
  colorTo = "#d39a29",
  style,
  reverse = false,
  initialOffset = 0,
  borderWidth = 1,
}: BorderBeamProps) => {
  const reducedMotion = useReducedMotion() ?? false

  // offset-path is still main-thread, but a pure CSS animation avoids MotionValue
  // per-frame JS. TimelineRail mounts one BorderBeam per itinerary day — so on
  // phones (tier !== 'full') this is skipped entirely rather than throttled.
  if (shouldDisableHeavyEffects()) {
    return null
  }

  if (reducedMotion) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit] border border-[rgba(211,154,41,.22)]",
          className,
        )}
        style={style}
      />
    )
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[inherit] border-(length:--border-beam-width) border-transparent mask-[linear-gradient(transparent,transparent),linear-gradient(#000,#000)] mask-intersect [mask-clip:padding-box,border-box]"
      style={
        {
          "--border-beam-width": `${borderWidth}px`,
        } as React.CSSProperties
      }
    >
      {/* CSS offset-path animation: same visual as the old motion.div, but no per-frame
          MotionValue main-thread work. Keyframes live in motion.css. */}
      <div
        aria-hidden="true"
        className={cn(
          "border-beam-dash absolute aspect-square",
          reverse ? "border-beam-dash--reverse" : "",
          "bg-linear-to-l from-(--color-from) via-(--color-to) to-transparent",
          className
        )}
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            "--color-from": colorFrom,
            "--color-to": colorTo,
            "--border-beam-duration": `${duration}s`,
            "--border-beam-delay": `${-delay}s`,
            "--border-beam-start": reverse
              ? `${100 - initialOffset}%`
              : `${initialOffset}%`,
            "--border-beam-end": reverse
              ? `${-initialOffset}%`
              : `${100 + initialOffset}%`,
            ...style,
          } as React.CSSProperties
        }
      />
    </div>
  )
}
