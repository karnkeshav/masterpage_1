import { authenticateWithCredentials, routeUser, initializeAuthListener } from "./auth-paywall.js";
import { getInitializedClients } from "./config.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

initializeAuthListener(async (user, profile) => {
    if (user && profile) {
        console.log("User already logged in, routing...");
        await routeUser(user);
    }
});

const loginForm = document.getElementById("sovereign-login-form");
const errorBox = document.getElementById("login-error");

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = document.getElementById("username").value.trim();
    const p = document.getElementById("password").value.trim();
    const btn = loginForm.querySelector("button");

    btn.disabled = true;
    btn.textContent = "Verifying...";
    errorBox.classList.add("hidden");

    try {
        await authenticateWithCredentials(u, p);
        const { auth } = await getInitializedClients();
        if (auth.currentUser) {
            await routeUser(auth.currentUser);
        }
    } catch (err) {
        console.error(err);
        errorBox.textContent = "Login failed. Please check your credentials.";
        errorBox.classList.remove("hidden");
        btn.disabled = false;
        btn.textContent = "Log In";
    }
});


const forgotModal = document.getElementById("forgot-password-modal");
const closeForgotModalBtn = document.getElementById("close-forgot-modal");
const submitResetBtn = document.getElementById("submit-reset-btn");
const resetMsgBox = document.getElementById("reset-msg");

document.getElementById("forgot-password-btn").addEventListener("click", () => {
    forgotModal.classList.remove("hidden");
});

closeForgotModalBtn.addEventListener("click", () => {
    forgotModal.classList.add("hidden");
    resetMsgBox.classList.add("hidden");
    document.getElementById("reset-email").value = "";
    document.getElementById("reset-student-name").value = "";
});

submitResetBtn.addEventListener("click", async () => {
    const email = document.getElementById("reset-email").value.trim();
    const studentName = document.getElementById("reset-student-name").value.trim();

    if (!email || !studentName) {
        resetMsgBox.textContent = "Both Email and Student Name are required.";
        resetMsgBox.className = "text-[11px] font-bold text-center p-2 rounded bg-red-900/20 text-red-400 block mt-3";
        return;
    }

    resetMsgBox.className = "hidden";
    const originalText = submitResetBtn.textContent;
    submitResetBtn.textContent = "Verifying Identity...";
    submitResetBtn.disabled = true;

    try {
        const res = await fetch('/api/secure-reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, studentName })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "An error occurred.");
        }

        if (data.resetLink && data.resetLink.startsWith('https://')) {
            const link = document.createElement('a');
            link.href = data.resetLink;
            link.textContent = 'Reset Password';
            link.className = 'underline font-black';
            resetMsgBox.textContent = data.message + ' ';
            resetMsgBox.appendChild(link);
        } else {
            resetMsgBox.textContent = data.message || "If the details match, a reset link will be sent shortly.";
        }
        resetMsgBox.className = "text-[11px] font-bold text-center p-2 rounded bg-green-900/20 text-green-400 block mt-3";

    } catch (err) {
        console.error(err);
        resetMsgBox.textContent = err.message;
        resetMsgBox.className = "text-[11px] font-bold text-center p-2 rounded bg-red-900/20 text-red-400 block mt-3";
    } finally {
        submitResetBtn.textContent = originalText;
        submitResetBtn.disabled = false;
    }
});

// Clear login fields on page load to prevent prefilled text
window.addEventListener('DOMContentLoaded', () => {
    const u = document.getElementById('username');
    const p = document.getElementById('password');
    if (u) u.value = '';
    if (p) p.value = '';
    // Also clear after a short delay to beat browser autofill timing
    setTimeout(() => {
        if (u) u.value = '';
        if (p) p.value = '';
    }, 200);
});
