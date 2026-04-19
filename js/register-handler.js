// js/register-handler.js
// Reads the selected plan from the URL query string and populates the registration form.

const PLANS = {
  practitioner: { name: 'The Practitioner',  price: '₹499',  priceLabel: '₹499/month' },
  strategist:   { name: 'Self-Strategist',   price: '₹999',  priceLabel: '₹999/month' },
  sync:         { name: 'The Sync Bundle',   price: '₹1,499', priceLabel: '₹1,499/month' },
  boardready:   { name: 'Board-Ready',       price: '₹1,299', priceLabel: '₹1,299/month' },
  legacy:       { name: 'The Legacy Plan',   price: '₹32,000', priceLabel: '₹32,000 (36 months)' }
};

function initRegisterPage() {
  const params = new URLSearchParams(window.location.search);
  const planKey = (params.get('plan') || '').toLowerCase();
  const plan = PLANS[planKey];

  const planText = document.getElementById('selected-plan-text');
  const priceDisplay = document.getElementById('price-display');

  if (plan) {
    if (planText) planText.textContent = plan.name;
    if (priceDisplay) priceDisplay.textContent = plan.priceLabel;
  } else {
    if (planText) planText.textContent = 'No Plan Selected';
    if (priceDisplay) priceDisplay.textContent = '—';
  }

  const form = document.getElementById('registration-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const studentClass = document.getElementById('reg-class').value;
      const board = document.getElementById('reg-board').value;

      if (!name || !email || !studentClass || !board) {
        alert('Please fill in all required fields.');
        return;
      }

      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.textContent = 'Processing…';

      // Placeholder: integrate with a payment gateway or Firebase in a future iteration.
      setTimeout(function () {
        alert('Registration submitted for ' + (plan ? plan.name : 'selected plan') + '. We will contact you shortly.');
        btn.disabled = false;
        btn.textContent = 'Complete Secure Payment';
      }, 1200);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRegisterPage);
} else {
  initRegisterPage();
}
