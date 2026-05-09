import React, { MouseEvent, useEffect, useState } from "react"
import { useReducedMotion } from "motion/react"

import { cn } from "@/lib/cn"

interface RippleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  rippleColor?: string
  duration?: string
}

export const RippleButton = React.forwardRef<
  HTMLButtonElement,
  RippleButtonProps
>(
  (
    {
      className,
      children,
      rippleColor = "#ffffff",
      duration = "600ms",
      onClick,
      ...props
    },
    ref
  ) => {
    const reducedMotion = useReducedMotion() ?? false
    const [buttonRipples, setButtonRipples] = useState<
      Array<{ x: number; y: number; size: number; key: number }>
    >([])

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      if (!reducedMotion) {
        createRipple(event)
      }
      onClick?.(event)
    }

    const createRipple = (event: MouseEvent<HTMLButtonElement>) => {
      const button = event.currentTarget
      const rect = button.getBoundingClientRect()
      const size = Math.max(rect.width, rect.height)
      const x = event.clientX - rect.left - size / 2
      const y = event.clientY - rect.top - size / 2

      const newRipple = { x, y, size, key: Date.now() }
      setButtonRipples((prevRipples) => [...prevRipples, newRipple])
    }

    useEffect(() => {
      if (reducedMotion) {
        setButtonRipples([])
        return
      }
      let timeout: ReturnType<typeof setTimeout> | null = null

      if (buttonRipples.length > 0) {
        const lastRipple = buttonRipples[buttonRipples.length - 1]
        timeout = setTimeout(() => {
          setButtonRipples((prevRipples) =>
            prevRipples.filter((ripple) => ripple.key !== lastRipple.key)
          )
        }, parseInt(duration))
      }

      return () => {
        if (timeout !== null) {
          clearTimeout(timeout)
        }
      }
    }, [buttonRipples, duration, reducedMotion])

    return (
      <button
        className={cn(
          "relative inline-flex cursor-pointer items-center justify-center overflow-hidden rounded-[16px] border border-[rgba(255,255,255,.6)] bg-[linear-gradient(180deg,rgba(217,65,50,.96),rgba(186,49,38,.96))] px-4 py-2 text-center font-semibold text-white shadow-[0_18px_38px_rgba(139,58,34,.18)] transition duration-200 hover:brightness-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(211,154,41,.52)]",
          className
        )}
        onClick={handleClick}
        ref={ref}
        type={props.type || "button"}
        {...props}
      >
        <div className="relative z-10">{children}</div>
        <span className="pointer-events-none absolute inset-0">
          {buttonRipples.map((ripple) => (
            <span
              className="animate-rippling absolute rounded-full opacity-30"
              key={ripple.key}
              style={
                {
                  width: `${ripple.size}px`,
                  height: `${ripple.size}px`,
                  top: `${ripple.y}px`,
                  left: `${ripple.x}px`,
                  backgroundColor: rippleColor,
                  transform: `scale(0)`,
                  "--duration": duration,
                } as React.CSSProperties
              }
            />
          ))}
        </span>
      </button>
    )
  }
)

RippleButton.displayName = "RippleButton"
