import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        /** IBBUL official palette */
        ibbul: {
          green: '#0F6B3E',
          'green-dark': '#0a4d2e',
          'green-light': '#e8f3ed',
          gold: '#C9A227',
          'gold-light': '#f5efd8',
        },
        brand: {
          50:  '#eef7f1',
          100: '#d5ebdd',
          200: '#abd7ba',
          300: '#7ab892',
          400: '#4a9969',
          500: '#1a7a47',
          600: '#0F6B3E',
          700: '#0c5532',
          800: '#094027',
          900: '#062b1a',
          950: '#031810',
        },
        gold: {
          50:  '#fbf8ef',
          100: '#f5efd8',
          200: '#ebdcb0',
          300: '#dfc882',
          400: '#d4b44f',
          500: '#C9A227',
          600: '#a8851f',
          700: '#876819',
          800: '#6b5215',
          900: '#4f3d10',
        },
        navy: {
          50:  '#f0f4fb',
          100: '#dce6f5',
          200: '#bfcfed',
          300: '#93aee0',
          400: '#6187ce',
          500: '#3e67be',
          600: '#2d52a3',
          700: '#264285',
          800: '#23386d',
          900: '#20305b',
          950: '#0d1b3e',
        },
        surface: {
          base: '#ffffff',
          raised: '#f8fafc',
          overlay: '#f1f5f9',
          sunken: '#e2e8f0',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Cormorant Garamond', 'DM Serif Display', 'Georgia', 'Times New Roman', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      spacing: {
        '4.5': '1.125rem',
        '13': '3.25rem',
        '18': '4.5rem',
        '22': '5.5rem',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 107, 62, 0.04), 0 4px 16px rgba(15, 23, 42, 0.06)',
        'card-hover': '0 8px 24px rgba(15, 107, 62, 0.08), 0 2px 8px rgba(15, 23, 42, 0.04)',
        modal: '0 20px 60px -10px rgba(0,0,0,0.25)',
        sidebar: '4px 0 24px rgba(6, 43, 26, 0.12)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.25s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
