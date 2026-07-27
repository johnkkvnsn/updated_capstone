/* ==========================================================
   1. Information (Variables)
   ========================================================== */
// We do not need global variables for this simple page, but the section is kept for structure.

/* ==========================================================
   2. Actions (Functions)
   ========================================================== */

// Handles the action when the user tries to submit the form
function processResetRequest(eventDetails) {
    // Stops the page from refreshing immediately
    eventDetails.preventDefault();

    // Grab the email address typed by the user
    const emailValue = document.getElementById('resetEmail').value;

    // Show a message confirming the email was received
    alert(`A password reset link has been sent to:\n${emailValue}\n\nPlease check your inbox.`);

    // Clear the input box after successful submission
    document.getElementById('forgotPasswordForm').reset();
}

/* ==========================================================
   3. Triggers (Event Handling)
   ========================================================== */

// Connects the form to the action function
function setupResetListener(resetForm) {
    if (resetForm) {
        resetForm.addEventListener('submit', processResetRequest);
    }
}

/* ==========================================================
   4. Page Elements (DOM)
   ========================================================== */

// Wait for the webpage to fully load before finding the form
document.addEventListener('DOMContentLoaded', () => {

    // Find the form element on the screen
    const passwordResetForm = document.getElementById('forgotPasswordForm');

    // Send the form to the setup function
    setupResetListener(passwordResetForm);
});