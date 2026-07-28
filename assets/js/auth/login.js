/* ==========================================================
   Login Page — BFMSS Capstone
   Uses DB layer for real authentication with role-based redirect
   ========================================================== */

let isPasswordVisible = false;

/* ==========================================================
   Functions
   ========================================================== */

function togglePasswordView(inputField, iconGraphic) {
    isPasswordVisible = !isPasswordVisible;

    if (isPasswordVisible) {
        inputField.setAttribute('type', 'text');
        iconGraphic.classList.remove('bi-eye');
        iconGraphic.classList.add('bi-eye-slash');
    } else {
        inputField.setAttribute('type', 'password');
        iconGraphic.classList.remove('bi-eye-slash');
        iconGraphic.classList.add('bi-eye');
    }
}

function showLoginError(message) {
    const alertBox = document.getElementById('loginAlert');
    if (alertBox) {
        alertBox.textContent = message;
        alertBox.classList.remove('d-none');
        alertBox.style.display = 'block';
    }
}

function hideLoginError() {
    const alertBox = document.getElementById('loginAlert');
    if (alertBox) {
        alertBox.classList.add('d-none');
        alertBox.style.display = 'none';
    }
}

function getRedirectUrl(roleId) {
    const map = {
        1: '../../pages/superadmin/superadmin-dashboard.html',
        2: '../../pages/admin/admin-dashboard.html',
        3: '../../pages/treasurer/treasurer-dashboard.html',
        4: '../../pages/sk/sk-dashboard.html',
    };
    return map[roleId] || '#';
}

async function processLoginSubmission(eventDetails) {
    eventDetails.preventDefault();
    hideLoginError();

    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showLoginError('Please enter your email and password.');
        return;
    }

    const response = await DB.validateLogin(email, password);

    if (!response || response.status !== 'success') {
        const errorMsg = response && response.message ? response.message : 'Invalid email or password. Please try again.';
        showLoginError(errorMsg);
        return;
    }

    const user = response.user;
    // Redirect based on role
    window.location.href = getRedirectUrl(user.roleId);
}

/* ==========================================================
   Event Listeners
   ========================================================== */
document.addEventListener('DOMContentLoaded', () => {
    const eyeToggleContainer = document.getElementById('togglePasswordBtn');
    const passwordInputBox   = document.getElementById('loginPassword');
    const eyeIconShape       = document.getElementById('eyeIcon');
    const accountLoginForm   = document.getElementById('loginForm');

    if (eyeToggleContainer && passwordInputBox && eyeIconShape) {
        eyeToggleContainer.addEventListener('click', function () {
            togglePasswordView(passwordInputBox, eyeIconShape);
        });
    }

    if (accountLoginForm) {
        accountLoginForm.addEventListener('submit', processLoginSubmission);
    }

    // Load theme preference
    const savedTheme = localStorage.getItem('userInterfaceTheme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

    // If already logged in, redirect
    const currentUser = DB.getCurrentUser();
    if (currentUser) {
        window.location.href = getRedirectUrl(currentUser.roleId);
    }
});
