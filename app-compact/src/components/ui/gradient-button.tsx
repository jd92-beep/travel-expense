import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/cn"

// Ported from 21st.dev's "GradientButton" (radial-gradient @property morph effect — see
// src/styles/gradient-button.css for the plain-CSS animation, since Tailwind v4's CSS-first
// setup dropped @layer components + @apply).
//
// Deviation from the 21st.dev source: the original used `min-w-[132px] px-9 py-4`, which is
// too wide for this app's 320px-wide mobile layouts. Sized down to `px-6 py-3` with no min-w
// so the button can sit inline in compact CTA rows without overflowing.
const gradientButtonVariants = cva(
  "gradient-button inline-flex items-center justify-center rounded-[11px] px-6 py-3 text-base font-bold text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "",
        variant: "gradient-button-variant",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface GradientButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof gradientButtonVariants> {
  asChild?: boolean
}

const GradientButton = React.forwardRef<HTMLButtonElement, GradientButtonProps>(
  ({ className, variant, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button"
    return (
      <Comp
        className={cn(gradientButtonVariants({ variant, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
GradientButton.displayName = "GradientButton"

export { GradientButton, gradientButtonVariants }
