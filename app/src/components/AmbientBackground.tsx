import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

function getTimeTheme() {
  const h = new Date().getHours();
  if (h >= 5 && h < 8)  return { b1:'rgba(255,145,164,0.26)',b2:'rgba(245,166,36,0.18)',b3:'rgba(204,41,41,0.14)' };
  if (h >= 8 && h < 17) return { b1:'rgba(204,41,41,0.18)',  b2:'rgba(245,166,36,0.22)',b3:'rgba(255,145,164,0.12)' };
  if (h >= 17 && h < 20)return { b1:'rgba(255,120,70,0.22)', b2:'rgba(204,41,41,0.22)', b3:'rgba(251,191,36,0.18)' };
  return { b1:'rgba(167,139,250,0.14)',b2:'rgba(204,41,41,0.14)',b3:'rgba(56,189,248,0.10)' };
}

export function AmbientBackground() {
  const [theme, setTheme] = useState(getTimeTheme);
  useEffect(() => {
    const id = setInterval(() => setTheme(getTimeTheme()), 5 * 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div aria-hidden className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, #FFF9F3 0%, #FDF5EF 40%, #FBEEDF 100%)' }} />
      <motion.div aria-hidden className="absolute rounded-full blur-3xl"
        style={{ width:600, height:600, top:'-18%', left:'-14%', willChange:'transform',
                 background:`radial-gradient(circle, ${theme.b1} 0%, transparent 70%)` }}
        animate={{ x:[0,60,-40,0], y:[0,40,-30,0], scale:[1,1.1,0.95,1] }}
        transition={{ duration:24, repeat:Infinity, ease:'easeInOut' }} />
      <motion.div aria-hidden className="absolute rounded-full blur-3xl"
        style={{ width:520, height:520, bottom:'-20%', right:'-14%', willChange:'transform',
                 background:`radial-gradient(circle, ${theme.b2} 0%, transparent 70%)` }}
        animate={{ x:[0,-50,30,0], y:[0,-40,20,0], scale:[1,0.92,1.12,1] }}
        transition={{ duration:30, repeat:Infinity, ease:'easeInOut' }} />
      <motion.div aria-hidden className="absolute rounded-full blur-3xl"
        style={{ width:420, height:420, top:'42%', right:'20%', willChange:'transform',
                 background:`radial-gradient(circle, ${theme.b3} 0%, transparent 70%)` }}
        animate={{ x:[0,40,-30,0], y:[0,-30,40,0] }}
        transition={{ duration:28, repeat:Infinity, ease:'easeInOut' }} />
      <svg aria-hidden className="absolute top-0 left-0 opacity-[0.05]" width="360" height="360" viewBox="0 0 100 100">
        <defs>
          <pattern id="seigaiha" x="0" y="0" width="20" height="10" patternUnits="userSpaceOnUse">
            <path d="M0 10 A 10 10 0 0 1 20 10" fill="none" stroke="#CC2929" strokeWidth="0.5"/>
            <path d="M-10 10 A 10 10 0 0 1 10 10" fill="none" stroke="#CC2929" strokeWidth="0.5"/>
            <path d="M10 10 A 10 10 0 0 1 30 10" fill="none" stroke="#CC2929" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#seigaiha)"/>
      </svg>
    </div>
  );
}
