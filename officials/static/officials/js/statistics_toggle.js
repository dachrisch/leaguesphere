// Switches between the two pre-rendered statistics tables (without vs.
// with external games) - both are already in the page, so toggling is
// purely a display swap, no extra request.
document.addEventListener("DOMContentLoaded", function () {
    const toggle = document.getElementById("include-external-toggle");
    const withoutExternal = document.getElementById("statistics-table-without-external");
    const withExternal = document.getElementById("statistics-table-with-external");
    if (!toggle || !withoutExternal || !withExternal) {
        return;
    }

    toggle.addEventListener("change", function () {
        if (toggle.checked) {
            withoutExternal.style.display = "none";
            withExternal.style.display = "";
        } else {
            withExternal.style.display = "none";
            withoutExternal.style.display = "";
        }
    });
});
