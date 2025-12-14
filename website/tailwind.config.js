// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class', // Enable dark mode with class strategy
  theme: {
    extend: {
      colors: {
        // Primary Brand Colors - Agriculture Theme
        primary: {
          DEFAULT: '#2E7D32',    // Deep green
          light: '#4CAF50',      // Bright green
          dark: '#1B5E20',       // Dark green
          50: '#E8F5E9',
          100: '#C8E6C9',
          200: '#A5D6A7',
          300: '#81C784',
          400: '#66BB6A',
          500: '#4CAF50',
          600: '#43A047',
          700: '#388E3C',
          800: '#2E7D32',
          900: '#1B5E20',
        },
        
        // Secondary Colors
        secondary: {
          brown: '#8D6E63',     // Earthy brown
          yellow: '#FFD54F',    // Golden yellow
          orange: '#FF9800',    // Orange highlights
        },
        
        // Neutral Colors
        neutral: {
          dark: '#263238',      // Dark text
          gray: {
            dark: '#546E7A',    // Secondary text
            DEFAULT: '#90A4AE', // Borders
            light: '#ECEFF1',   // Backgrounds
          },
          white: '#FFFFFF',
        },
        
        // Status Colors
        status: {
          success: '#4CAF50',
          warning: '#FF9800',
          error: '#F44336',
          info: '#2196F3',
        },
        
        // Additional Marketplace Colors
        marketplace: {
          farmer: '#7CB342',    // Farmer green
          soil: '#8D6E63',      // Soil brown
          harvest: '#FFB74D',   // Harvest orange
          growth: '#66BB6A',    // Growth light green
        },
      },
      
      // Font Family
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
      
      // Box Shadows
      boxShadow: {
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'dropdown': '0 10px 25px rgba(46, 125, 50, 0.1)',
        'button': '0 4px 14px 0 rgba(46, 125, 50, 0.39)',
      },
      
      // Border Radius
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
      
      // Animations
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'bounce-slow': 'bounce 2s infinite',
        'pulse-slow': 'pulse 3s infinite',
        'shake': 'shake 0.5s ease-in-out',
      },
      
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-5px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(5px)' },
        },
      },
      
      // Gradients
      backgroundImage: {
        'gradient-agro': 'linear-gradient(135deg, #2E7D32 0%, #4CAF50 100%)',
        'gradient-harvest': 'linear-gradient(135deg, #FFD54F 0%, #FF9800 100%)',
        'gradient-soil': 'linear-gradient(135deg, #8D6E63 0%, #5D4037 100%)',
        'gradient-growth': 'linear-gradient(135deg, #66BB6A 0%, #43A047 100%)',
        'gradient-card': 'linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(46, 125, 50, 0.05) 100%)',
      },
      
      // Container Padding
      container: {
        padding: {
          DEFAULT: '1rem',
          sm: '2rem',
          lg: '4rem',
          xl: '5rem',
          '2xl': '6rem',
        },
      },
      
      // Spacing
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
        '144': '36rem',
      },
      
      // Typography
      fontSize: {
        'xxs': '0.625rem',
        '3xl': '1.875rem',
        '4xl': '2.25rem',
        '5xl': '3rem',
        '6xl': '3.75rem',
        '7xl': '4.5rem',
        '8xl': '6rem',
      },
      
      // Z-Index
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
      },
    },
  },
  
  // Variants
  variants: {
    extend: {
      backgroundColor: ['active', 'disabled'],
      textColor: ['active', 'disabled'],
      opacity: ['disabled'],
      cursor: ['disabled'],
      scale: ['group-hover'],
      translate: ['group-hover'],
      boxShadow: ['active', 'focus-within'],
    },
  },
  
  // Plugins
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
    require('@tailwindcss/line-clamp'),
    // Custom plugin for agriculture icons
    function({ addUtilities }) {
      const newUtilities = {
        '.agro-icon': {
          'background-image': 'url("/icons/agriculture-sprite.svg")',
          'background-repeat': 'no-repeat',
          'display': 'inline-block',
        },
        '.text-gradient': {
          'background-clip': 'text',
          '-webkit-background-clip': 'text',
          '-webkit-text-fill-color': 'transparent',
        },
        '.shadow-inner-lg': {
          'box-shadow': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
        },
      }
      addUtilities(newUtilities)
    }
  ],
}