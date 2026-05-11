import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const WALLPAPERS = Array.from({ length: 9 }, (_, i) => `wallpapers/bg-${i + 1}.png`);

export function HyperframeBackground() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // Randomize initial wallpaper
    setCurrentIndex(Math.floor(Math.random() * WALLPAPERS.length));
    
    // Rotate every 15 seconds
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % WALLPAPERS.length);
    }, 15000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: -1,
        pointerEvents: 'none',
        overflow: 'hidden',
        backgroundColor: '#000',
        transform: 'translateZ(0)' // Force GPU layer
      }}
    >
      <AnimatePresence mode="popLayout">
        <motion.img
          key={currentIndex}
          src={`${import.meta.env.BASE_URL}${WALLPAPERS[currentIndex]}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ 
            opacity: { duration: 2.5, ease: 'easeInOut' }
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            willChange: 'opacity'
          }}
          alt="Hyperframe Background"
        />
      </AnimatePresence>
    </div>
  );
}
