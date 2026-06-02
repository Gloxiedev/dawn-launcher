import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        dawn: {
          coal: '#080808',
          panel: 'rgba(22, 22, 22, 0.72)',
          panelStrong: 'rgba(31, 29, 27, 0.92)',
          orange: '#ff7a1a',
          amber: '#ffb84d',
          ember: '#ff4d1f',
          line: 'rgba(255, 255, 255, 0.1)'
        }
      },
      boxShadow: {
        glow: '0 0 40px rgba(255, 122, 26, 0.25)',
        panel: '0 20px 70px rgba(0, 0, 0, 0.42)'
      },
      fontFamily: {
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
} satisfies Config;
