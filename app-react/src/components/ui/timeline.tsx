"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

import { cn } from "@/lib/cn";

interface TimelineEntry {
  title: string;
  content: React.ReactNode;
}

export const Timeline = ({
  data,
  eyebrow,
  title,
  description,
  className,
}: {
  data: TimelineEntry[];
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const reducedMotion = useReducedMotion() ?? false;

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setHeight(rect.height);
  }, [data.length]);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 10%", "end 50%"],
  });

  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height]);
  const opacityTransform = useTransform(scrollYProgress, [0, 0.1], [0, 1]);

  return (
    <div
      className={cn("w-full font-sans text-[color:var(--ink)] md:px-10", className)}
      ref={containerRef}
    >
      {(eyebrow || title || description) && (
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 lg:px-10">
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          {title && (
            <h2 className="mb-3 text-[clamp(24px,5vw,40px)] font-[700] leading-[1.02] text-[color:var(--navy)]">
              {title}
            </h2>
          )}
          {description && (
            <p className="max-w-2xl text-sm leading-6 text-[color:var(--muted)] md:text-base">
              {description}
            </p>
          )}
        </div>
      )}

      <div ref={ref} className="relative mx-auto max-w-7xl pb-20">
        {data.map((item, index) => (
          <div
            key={index}
            className="flex justify-start pt-10 md:gap-10 md:pt-16"
          >
            <div className="sticky top-28 z-40 flex max-w-xs flex-col items-center self-start md:w-full md:flex-row lg:max-w-sm">
              <div className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(255,255,255,.84)] bg-[rgba(255,252,245,.94)] shadow-[0_10px_24px_rgba(67,46,24,.12)] md:left-3">
                <div className="h-4 w-4 rounded-full border border-[rgba(217,65,50,.28)] bg-[rgba(217,65,50,.14)] p-2" />
              </div>
              <h3 className="hidden text-xl font-bold text-[color:var(--muted)] md:block md:pl-20 md:text-5xl">
                {item.title}
              </h3>
            </div>

            <div className="relative w-full pl-20 pr-4 md:pl-4">
              <h3 className="mb-4 block text-left text-2xl font-bold text-[color:var(--muted)] md:hidden">
                {item.title}
              </h3>
              {item.content}
            </div>
          </div>
        ))}
        <div
          style={{ height: `${height}px` }}
          className="absolute left-8 top-0 w-[2px] overflow-hidden bg-[linear-gradient(to_bottom,var(--tw-gradient-stops))] from-transparent via-[rgba(211,154,41,.18)] to-transparent [mask-image:linear-gradient(to_bottom,transparent_0%,black_10%,black_90%,transparent_100%)] md:left-8"
        >
          <motion.div
            style={{
              height: reducedMotion ? height : heightTransform,
              opacity: reducedMotion ? 1 : opacityTransform,
            }}
            className="absolute inset-x-0 top-0 w-[2px] rounded-full bg-gradient-to-t from-[rgba(217,65,50,.92)] via-[rgba(211,154,41,.86)] to-transparent from-[0%] via-[10%]"
          />
        </div>
      </div>
    </div>
  );
};
