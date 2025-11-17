/* ========================================
   LeagueSphere User Manual JavaScript
   ======================================== */

document.addEventListener('DOMContentLoaded', function() {
    // Highlight current page in sidebar
    highlightCurrentPage();

    // Add back-to-top button
    addBackToTopButton();

    // Enable tooltips (if Bootstrap tooltips are used)
    enableTooltips();
});

/**
 * Highlight the current page in the sidebar navigation
 */
function highlightCurrentPage() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.sidebar .nav-link');

    navLinks.forEach(link => {
        const linkHref = link.getAttribute('href');
        if (linkHref === currentPage) {
            link.classList.add('active');
        }
    });
}

/**
 * Add a back-to-top button
 */
function addBackToTopButton() {
    const button = document.createElement('button');
    button.innerHTML = '&uarr;';
    button.className = 'btn btn-primary back-to-top';
    button.setAttribute('aria-label', 'Nach oben');
    button.title = 'Nach oben';

    document.body.appendChild(button);

    // Show/hide button based on scroll position
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            button.classList.add('show');
        } else {
            button.classList.remove('show');
        }
    });

    // Scroll to top on click
    button.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

/**
 * Enable Bootstrap tooltips
 */
function enableTooltips() {
    const tooltipTriggerList = [].slice.call(
        document.querySelectorAll('[data-bs-toggle="tooltip"]')
    );
    tooltipTriggerList.map(function(tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}
