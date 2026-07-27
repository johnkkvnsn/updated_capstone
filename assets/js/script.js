/* ==========================================================
   1. Page Elements (DOM Values)
   ========================================================== */
const pageRoot = document.documentElement;
const themeToggleContainer = document.getElementById('themeToggleBtn');
const interfaceThemeIcon = document.getElementById('themeIcon');
const messageContactForm = document.getElementById('contactForm');
const popUpToastContainer = document.getElementById('formToast');
const toastMessageElement = document.getElementById('toastMessage');
const toastIconElement = document.getElementById('toastIcon');
const viewportRevealItems = document.querySelectorAll('.reveal-item');
const navigationBarLinks = document.querySelectorAll('.navbar-nav .nav-link:not(.login-btn)');
const websiteSections = document.querySelectorAll('section');

/* ==========================================================
   2. Actions (Functions)
   ========================================================== */

// Applies saved color choices when page opens
function loadSystemUserTheme() {
    const historicalThemePreference = localStorage.getItem('userInterfaceTheme');

    if (historicalThemePreference) {
        pageRoot.setAttribute('data-theme', historicalThemePreference);
        refreshThemeTogglerIcon(historicalThemePreference);
    }
}

// Swaps colors between dark and light
function toggleInterfaceColorMode() {
    const activeInterfaceTheme = pageRoot.getAttribute('data-theme');
    const targetInterfaceTheme = activeInterfaceTheme === 'dark' ? 'light' : 'dark';

    pageRoot.setAttribute('data-theme', targetInterfaceTheme);
    localStorage.setItem('userInterfaceTheme', targetInterfaceTheme);

    refreshThemeTogglerIcon(targetInterfaceTheme);
}

// Swaps the moon and sun symbols
function refreshThemeTogglerIcon(currentViewMode) {
    if (currentViewMode === 'dark') {
        interfaceThemeIcon.className = 'bi bi-sun-fill';
    } else {
        interfaceThemeIcon.className = 'bi bi-moon-stars-fill';
    }
}

// Shows the Tailwind style pop-up box with different statuses
function showNotification(type, message) {
    // Reset existing classes
    popUpToastContainer.classList.remove('toast-success', 'toast-error', 'toast-warning');
    toastIconElement.className = 'fs-4 me-3'; // Keep base classes

    // Apply colors and icons based on type
    if (type === 'success') {
        popUpToastContainer.classList.add('toast-success');
        toastIconElement.classList.add('bi-check-circle-fill');
    } else if (type === 'error') {
        popUpToastContainer.classList.add('toast-error');
        toastIconElement.classList.add('bi-x-circle-fill');
    } else if (type === 'warning') {
        popUpToastContainer.classList.add('toast-warning');
        toastIconElement.classList.add('bi-exclamation-triangle-fill');
    }

    // Insert text message
    toastMessageElement.textContent = message;

    // Show the box on screen
    const operationalNotification = new bootstrap.Toast(popUpToastContainer);
    operationalNotification.show();
}

// Runs when form is submitted
function processFormSubmission(submissionEvent) {
    submissionEvent.preventDefault();

    // Call the success notification
    showNotification('success', 'Your message has been sent successfully!');

    // Clear inputs
    messageContactForm.reset();
}

// Fades elements in when scrolling down
function initializeIntersectionObserver() {
    const trackingConfiguration = {
        threshold: 0.15,
        rootMargin: "0px 0px -50px 0px"
    };

    const componentObserver = new IntersectionObserver((observedEntries, currentObserver) => {
        observedEntries.forEach(validEntry => {
            if (validEntry.isIntersecting) {
                validEntry.target.classList.add('show-item');
                currentObserver.unobserve(validEntry.target);
            }
        });
    }, trackingConfiguration);

    viewportRevealItems.forEach(targetItem => {
        componentObserver.observe(targetItem);
    });
}

// Marks top menu item based on user scroll position
function handleWindowScrollSpy() {
    let activeSectionId = '';

    websiteSections.forEach(currentSection => {
        const structuralSectionTop = currentSection.offsetTop - 120;
        if (window.scrollY >= structuralSectionTop) {
            activeSectionId = currentSection.getAttribute('id');
        }
    });

    navigationBarLinks.forEach(individualLink => {
        individualLink.classList.remove('active');
        if (individualLink.getAttribute('href') === `#${activeSectionId}`) {
            individualLink.classList.add('active');
        }
    });
}

/* ==========================================================
   3. Page Events (Event Listeners)
   ========================================================== */

// Sets up page once fully loaded
document.addEventListener('DOMContentLoaded', () => {
    loadSystemUserTheme();
    initializeIntersectionObserver();
});

// Runs color swap when button clicked
themeToggleContainer.addEventListener('click', toggleInterfaceColorMode);

// Stops page reload on send and shows message
messageContactForm.addEventListener('submit', processFormSubmission);

// Updates active menu item while moving page up or down
window.addEventListener('scroll', handleWindowScrollSpy);