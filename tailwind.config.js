/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./app/**/*.html",
        "./js/**/*.js"
    ],
    theme: {
        extend: {
            fontFamily: { sans: ['Inter', 'sans-serif'] },
            colors: {
                'cbse-blue': '#1a3e6a',
                'cbse-light': '#f8fafc',
                'accent-gold': '#d4a373',
                'success-green': '#059669',
                'danger-red': '#dc2626',
                'warning-yellow': '#ca8a04'
            }
        }
    },
    plugins: [],
}
