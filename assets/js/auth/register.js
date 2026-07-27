/* ==========================================================
   1. Information (Variables)
   ========================================================== */
// Keeps track of the visibility states for both password fields
let isMainPasswordVisible = false;
let isConfirmPasswordVisible = false;

/* ==========================================================
   2. Actions (Functions)
   ========================================================== */

// Switches the input type between text and password for a specific field
function toggleVisibility(inputField, iconGraphic, isVisibleFlag) {
    const newState = !isVisibleFlag;

    if (newState) {
        inputField.setAttribute('type', 'text');
        iconGraphic.classList.remove('bi-eye');
        iconGraphic.classList.add('bi-eye-slash');
    } else {
        inputField.setAttribute('type', 'password');
        iconGraphic.classList.remove('bi-eye-slash');
        iconGraphic.classList.add('bi-eye');
    }

    return newState;
}

// Handles the action when the user submits the registration form
function processRegistration(eventDetails) {
    // Stops the page from refreshing immediately
    eventDetails.preventDefault();

    // Grab the values from the password fields
    const mainPassword = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Check if passwords match
    if (mainPassword !== confirmPassword) {
        alert("Error: Passwords do not match. Please try again.");
        return; // Stop the registration process here
    }

    // If passwords match, proceed with registration simulation
    alert("Registration successful! Welcome to BFMSS.");

    // Clear the form
    document.getElementById('registerForm').reset();

    // Optional: Redirect user to login page
    // window.location.href = "login.html"; 
}

/* ==========================================================
   3. Triggers (Event Handling)
   ========================================================== */

// Connects actions to the specific buttons and form
function setupRegistrationListeners() {

    const toggleMainBtn = document.getElementById('togglePasswordBtn');
    const mainPassInput = document.getElementById('registerPassword');
    const mainIcon = document.getElementById('eyeIcon1');

    const toggleConfirmBtn = document.getElementById('toggleConfirmPasswordBtn');
    const confirmPassInput = document.getElementById('confirmPassword');
    const confirmIcon = document.getElementById('eyeIcon2');

    const regForm = document.getElementById('registerForm');

    // Add click event for the first password field
    if (toggleMainBtn && mainPassInput && mainIcon) {
        toggleMainBtn.addEventListener('click', function () {
            isMainPasswordVisible = toggleVisibility(mainPassInput, mainIcon, isMainPasswordVisible);
        });
    }

    // Add click event for the confirm password field
    if (toggleConfirmBtn && confirmPassInput && confirmIcon) {
        toggleConfirmBtn.addEventListener('click', function () {
            isConfirmPasswordVisible = toggleVisibility(confirmPassInput, confirmIcon, isConfirmPasswordVisible);
        });
    }

    // Add submit event for the form
    if (regForm) {
        regForm.addEventListener('submit', processRegistration);
    }
}

/* ==========================================================
   4. Page Elements (DOM)
   ========================================================== */

// Wait for the webpage to fully load before attaching events
document.addEventListener('DOMContentLoaded', () => {
    setupRegistrationListeners();
});