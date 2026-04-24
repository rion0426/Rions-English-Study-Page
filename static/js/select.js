(function () {
    const defaultSettings = {
        darkMode: false,
        practiceReveal: true,
        practiceWordHint: false,
        fillPreview: false,
        fillFirstLetter: false,
    };

    function loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem("englishStudySettings") || "{}");
            return { ...defaultSettings, ...saved };
        } catch (error) {
            return { ...defaultSettings };
        }
    }

    function saveSettings(settings) {
        localStorage.setItem("englishStudySettings", JSON.stringify(settings));
    }

    function applyTheme(settings) {
        document.documentElement.classList.toggle("dark-mode", Boolean(settings.darkMode));
        document.body.classList.toggle("dark-mode", Boolean(settings.darkMode));
        const darkModeToggle = document.getElementById("darkModeToggle");
        if (darkModeToggle) {
            darkModeToggle.checked = settings.darkMode;
        }
    }

    window.EnglishStudyPages = window.EnglishStudyPages || {};
    window.EnglishStudyPages.select = {
        init() {
            if (document.body.dataset.page !== "select") {
                return () => {};
            }

            const settings = loadSettings();
            const darkModeToggle = document.getElementById("darkModeToggle");
            const profilePic = document.getElementById("profilePic");
            const profileInfo = document.getElementById("profileInfo");

            applyTheme(settings);

            function toggleProfile(event) {
                event.stopPropagation();
                profileInfo.classList.toggle("show");
            }

            function closeProfile(event) {
                if (!profileInfo.contains(event.target) && !profilePic.contains(event.target)) {
                    profileInfo.classList.remove("show");
                }
            }

            function handleDarkModeChange() {
                settings.darkMode = darkModeToggle.checked;
                saveSettings(settings);
                applyTheme(settings);
            }

            if (darkModeToggle) {
                darkModeToggle.addEventListener("change", handleDarkModeChange);
            }

            if (profilePic && profileInfo) {
                profilePic.addEventListener("click", toggleProfile);
                document.addEventListener("click", closeProfile);
            }

            return () => {
                if (darkModeToggle) {
                    darkModeToggle.removeEventListener("change", handleDarkModeChange);
                }
                if (profilePic && profileInfo) {
                    profilePic.removeEventListener("click", toggleProfile);
                    document.removeEventListener("click", closeProfile);
                }
            };
        },
    };
}());
