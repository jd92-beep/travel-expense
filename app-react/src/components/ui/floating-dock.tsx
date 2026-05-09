"use client";

import { cn } from "@/lib/cn";
import {
  AnimatePresence,
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";

import { useRef, useState } from "react";

export type FloatingDockItem = {
  title: string;
  icon: React.ReactNode;
  onSelect: () => void;
  active?: boolean;
  badge?: React.ReactNode;
};

export const FloatingDock = ({
  items,
  desktopClassName,
  mobileClassName,
}: {
  items: FloatingDockItem[];
  desktopClassName?: string;
  mobileClassName?: string;
}) => {
  return (
    <>
      <FloatingDockDesktop items={items} className={desktopClassName} />
      <FloatingDockMobile items={items} className={mobileClassName} />
    </>
  );
};

const FloatingDockMobile = ({
  items,
  className,
}: {
  items: FloatingDockItem[];
  className?: string;
}) => {
  return (
    <motion.nav
      aria-label="主要分頁"
      className={cn(
        "mx-auto grid w-full grid-cols-7 gap-1 rounded-[26px] border border-[rgba(255,255,255,.68)] bg-[rgba(255,252,245,.92)] px-2 py-2 shadow-[0_24px_54px_rgba(67,46,24,.14)] backdrop-blur-xl md:hidden",
        className,
      )}
    >
      {items.map((item) => (
        <DockItemButton key={item.title} item={item} mobile />
      ))}
    </motion.nav>
  );
};

const FloatingDockDesktop = ({
  items,
  className,
}: {
  items: FloatingDockItem[];
  className?: string;
}) => {
  const reducedMotion = useReducedMotion() ?? false;
  const mouseX = useMotionValue(Infinity);

  return (
    <motion.nav
      aria-label="主要分頁"
      onMouseMove={reducedMotion ? undefined : (e) => mouseX.set(e.pageX)}
      onMouseLeave={reducedMotion ? undefined : () => mouseX.set(Infinity)}
      className={cn(
        "mx-auto hidden h-[72px] items-end gap-3 rounded-[28px] border border-[rgba(255,255,255,.68)] bg-[rgba(255,252,245,.9)] px-3 pb-2 shadow-[0_26px_60px_rgba(67,46,24,.16)] backdrop-blur-xl md:flex",
        className,
      )}
    >
      {items.map((item) => (
        <DockItemButton
          key={item.title}
          item={item}
          mouseX={mouseX}
          reducedMotion={reducedMotion}
        />
      ))}
    </motion.nav>
  );
};

function DockItemButton({
  item,
  mouseX,
  mobile = false,
  reducedMotion = false,
}: {
  item: FloatingDockItem;
  mouseX?: MotionValue<number>;
  mobile?: boolean;
  reducedMotion?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const fallbackMouseX = useMotionValue(Infinity);
  const motionX = mouseX ?? fallbackMouseX;

  const distance = useTransform(motionX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const widthTransform = useTransform(distance, [-150, 0, 150], [44, 76, 44]);
  const heightTransform = useTransform(distance, [-150, 0, 150], [44, 76, 44]);
  const widthTransformIcon = useTransform(distance, [-150, 0, 150], [20, 36, 20]);
  const heightTransformIcon = useTransform(distance, [-150, 0, 150], [20, 36, 20]);

  const width = useSpring(widthTransform, { mass: 0.1, stiffness: 150, damping: 12 });
  const height = useSpring(heightTransform, { mass: 0.1, stiffness: 150, damping: 12 });
  const widthIcon = useSpring(widthTransformIcon, { mass: 0.1, stiffness: 150, damping: 12 });
  const heightIcon = useSpring(heightTransformIcon, { mass: 0.1, stiffness: 150, damping: 12 });

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={item.onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-current={item.active ? "page" : undefined}
      className={cn(
        "relative flex min-w-0 items-center justify-center rounded-full border border-transparent text-[color:var(--navy)] outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-[rgba(211,154,41,.42)]",
        "flex-col gap-0.5 px-1 py-1.5",
        item.active &&
          "border-[rgba(217,65,50,.18)] bg-[linear-gradient(180deg,rgba(217,65,50,.14),rgba(211,154,41,.12))] shadow-[inset_0_1px_0_rgba(255,255,255,.84)]",
      )}
      style={
        mobile || reducedMotion
          ? undefined
          : {
              width,
              height,
            }
      }
    >
      {/* Persistent label rendered below; hover tooltip removed */}
      <motion.div
        style={mobile || reducedMotion ? undefined : { width: widthIcon, height: heightIcon }}
        className="relative flex items-center justify-center"
      >
        {item.active && !mobile && (
          <motion.i
            layoutId="floating-dock-active"
            className="absolute inset-0 rounded-full bg-[rgba(217,65,50,.08)]"
          />
        )}
        <span className="relative z-10 inline-flex items-center justify-center">{item.icon}</span>
      </motion.div>
      <span
        className={cn(
          "max-w-full truncate text-[10px] font-bold leading-none",
          item.active ? "text-[#D94132]" : "text-[#9A8E83]",
        )}
      >
        {item.title}
      </span>
      {mobile && item.badge ? (
        <span className="mt-0.5 text-[10px] text-[color:var(--muted)]">{item.badge}</span>
      ) : null}
    </motion.button>
  );
}
