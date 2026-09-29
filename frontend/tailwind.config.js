/** Tailwind-Build für die Django-Templates. Nach Template-Änderungen: cd frontend && npm run build */
module.exports = {
  content: ['../templates/**/*.html', '../jds/forms.py', '../accounts/forms.py', '../schiedsrichter/forms.py', '../schiedsrichter/templatetags/*.py'],
  // Status-Farben werden in Templates dynamisch zusammengesetzt: bg-{{ status|ton }}-100 / text-…-800
  safelist: [{ pattern: /^(bg|text)-(slate|blue|amber|red|green|sky)-(100|800)$/ }],
  theme: { extend: {} },
  plugins: [],
};
