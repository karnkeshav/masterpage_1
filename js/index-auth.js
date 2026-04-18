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
        const { getInitializedClients } = await import("./config.js");
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


document.getElementById("forgot-password-btn").addEventListener("click", async () => {
    const username = document.getElementById("username").value.trim();
    if (!username) {
        errorBox.textContent = "Please enter your username to reset your password.";
        errorBox.classList.remove("hidden");
        return;
    }

    errorBox.classList.add("hidden");
    const btn = document.getElementById("forgot-password-btn");
    const originalText = btn.textContent;
    btn.textContent = "Sending...";
    btn.disabled = true;

    try {
        const { auth } = await getInitializedClients();
        const email = username.includes('@') ? username : `ready4urexam+${username}@gmail.com`;
        await sendPasswordResetEmail(auth, email);

        errorBox.classList.remove("hidden", "bg-red-900/20", "text-red-400");
        errorBox.classList.add("bg-green-900/20", "text-green-400");
        errorBox.textContent = "Password reset email sent! Check your inbox.";
    } catch (err) {
        console.error(err);
        errorBox.classList.remove("hidden", "bg-green-900/20", "text-green-400");
        errorBox.classList.add("bg-red-900/20", "text-red-400");
        errorBox.textContent = err.code === 'auth/user-not-found' ? "User not found." : "Failed to send reset email. " + err.message;
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
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
