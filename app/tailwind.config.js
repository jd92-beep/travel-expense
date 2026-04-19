/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          50:'#FFFFFF',100:'#FDF5EF',200:'#F7EEE3',300:'#EFE4D3',400:'#E4D4BF',
          500:'#B8A893',600:'#8A7C6A',700:'#5C5246',800:'#2B2620',900:'#1A1A2E',
        },
        ink: {
          950:'#0a0908',900:'#14110f',850:'#1a1614',800:'#1f1a17',700:'#2a2420',
          600:'#3c342e',500:'#6b6058',400:'#a8a29e',300:'#d6d3d1',200:'#f5f5f4',100:'#fafaf9',
        },
        arsenal: {
          50:'#fff1f0',100:'#ffd7d1',200:'#ffb4a8',300:'#ff8777',400:'#ff5a48',
          500:'#ef4135',600:'#CC2929',700:'#9a1f1f',800:'#6b1414',900:'#3f0a0a',
        },
        ember: {300:'#fbbf24',400:'#f59e0b',500:'#F5A623',600:'#d97706'},
        sakura:{100:'#fef0f3',200:'#fdd6dc',300:'#f9b3bd',400:'#FF91A4'},
        jade:{300:'#86efac',400:'#4ade80',500:'#22c55e',600:'#16a34a'},
      },
      fontFamily: {
        sans:['Inter','ui-sans-serif','system-ui','-apple-system','sans-serif'],
        mono:['"JetBrains Mono"','ui-monospace','SFMono-Regular','monospace'],
        display:['"Noto Serif JP"','Georgia','ui-serif','serif'],
      },
      boxShadow: {
        'glow-sm':'0 4px 20px -4px rgba(204,41,41,0.20)',
        glow:'0 10px 40px -8px rgba(204,41,41,0.30)',
        'glow-lg':'0 16px 60px -12px rgba(204,41,41,0.40)',
        'glow-gold':'0 10px 40px -8px rgba(245,166,36,0.35)',
        'inner-glow':'inset 0 1px 0 0 rgba(255,255,255,0.9)',
        card:'0 1px 2px rgba(204,41,41,0.04),0 8px 32px -12px rgba(204,41,41,0.12),inset 0 1px 0 rgba(255,255,255,0.9)',
      },
      backgroundImage: {
        'gradient-arsenal':'linear-gradient(135deg,#CC2929 0%,#F5A623 55%,#FFB300 100%)',
        'gradient-ember':'linear-gradient(135deg,#f97316 0%,#f59e0b 100%)',
        'gradient-sakura':'linear-gradient(135deg,#FF91A4 0%,#FFB300 100%)',
        'gradient-sheen':'linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.6) 50%,transparent 60%)',
      },
      animation: {
        'fade-up':'fadeUp 0.45s cubic-bezier(0.16,1,0.3,1)',
        shimmer:'shimmer 3.2s ease-in-out infinite',
        float:'float 6s ease-in-out infinite',
        'glow-pulse':'glowPulse 2.8s ease-in-out infinite',
        'spin-slow':'spin 24s linear infinite',
      },
      keyframes: {
        fadeUp:{'0%':{opacity:'0',transform:'translateY(10px)'},'100%':{opacity:'1',transform:'translateY(0)'}},
        shimmer:{'0%,100%':{backgroundPosition:'0% 50%'},'50%':{backgroundPosition:'100% 50%'}},
        float:{'0%,100%':{transform:'translateY(0)'},'50%':{transform:'translateY(-8px)'}},
        glowPulse:{'0%,100%':{opacity:'0.55'},'50%':{opacity:'1'}},
      },
    },
  },
  plugins: [],
};
