// Filters the team cards on the "all teams" list by name, and hides any
// letter-group heading whose cards have all been filtered out.
document.addEventListener("DOMContentLoaded", function () {
    const searchInput = document.getElementById("team-search");
    if (!searchInput) {
        return;
    }

    const letterGroups = document.querySelectorAll(".team-letter-group");

    searchInput.addEventListener("input", function () {
        const query = searchInput.value.trim().toLowerCase();

        letterGroups.forEach(function (group) {
            const cards = group.querySelectorAll(".team-card");
            let visibleCount = 0;

            cards.forEach(function (card) {
                const teamName = card.getAttribute("data-team-name") || "";
                const isMatch = teamName.indexOf(query) !== -1;
                card.style.display = isMatch ? "" : "none";
                if (isMatch) {
                    visibleCount += 1;
                }
            });

            group.style.display = visibleCount > 0 ? "" : "none";
        });
    });
});
