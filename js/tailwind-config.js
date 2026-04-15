// js/tailwind-config.js
// Master Tailwind CDN Configuration — Single Source of Truth
// Every HTML page must load this AFTER the Tailwind CDN <script> tag.
// Usage: <script src="path/to/js/tailwind-config.js"></script>

tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Merriweather', 'serif']
      },
      colors: {
        'cbse-blue':       '#1a3e6a',
        'cbse-light':      '#f5f7fa',
        'accent-gold':     '#ffb703',
        'success-green':   '#16a34a',
        'warning-yellow':  '#ca8a04',
        'danger-red':      '#dc2626',
        'gold':            '#ffbe0b',
        'heading':         '#0f172a'
      },
      backgroundImage: {
        'hero-grad': 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #1a3e6a 100%)'
      }
    }
  }
};
