(function () {
    const pages = window.EnglishStudyPages = window.EnglishStudyPages || {};
    let currentCleanup = () => {};
    let currentRequestToken = 0;

    function isSameOrigin(url) {
        return url.origin === window.location.origin;
    }

    function shouldInterceptLink(link, event) {
        if (!link || !link.href) {
            return false;
        }
        if (link.target && link.target !== "_self") {
            return false;
        }
        if (link.hasAttribute("download") || link.dataset.noPjax !== undefined) {
            return false;
        }
        if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)) {
            return false;
        }

        const url = new URL(link.href, window.location.href);
        if (!isSameOrigin(url)) {
            return false;
        }
        if (url.hash && url.pathname === window.location.pathname && url.search === window.location.search) {
            return false;
        }
        return true;
    }

    function updateBodyFromDocument(nextDocument) {
        const nextRoot = nextDocument.getElementById("page-root");
        const currentRoot = document.getElementById("page-root");
        if (!nextRoot || !currentRoot) {
            throw new Error("Missing page root");
        }

        document.title = nextDocument.title;
        document.body.className = nextDocument.body.className;
        document.body.dataset.page = nextDocument.body.dataset.page || "";
        currentRoot.replaceWith(nextRoot);
    }

    function initCurrentPage() {
        const pageKey = document.body.dataset.page;
        const page = pages[pageKey];
        currentCleanup = () => {};
        if (page && typeof page.init === "function") {
            currentCleanup = page.init() || (() => {});
        }
    }

    async function loadPage(url, options = {}) {
        const targetUrl = new URL(url, window.location.href);
        const requestToken = ++currentRequestToken;

        try {
            const response = await fetch(targetUrl.href, {
                headers: {
                    "X-Requested-With": "EnglishStudyPJAX",
                },
            });
            if (!response.ok) {
                window.location.href = targetUrl.href;
                return;
            }

            const html = await response.text();
            if (requestToken !== currentRequestToken) {
                return;
            }

            const nextDocument = new DOMParser().parseFromString(html, "text/html");
            currentCleanup();
            updateBodyFromDocument(nextDocument);
            initCurrentPage();

            const finalUrl = response.url || targetUrl.href;
            if (options.history === "push") {
                window.history.pushState({}, "", finalUrl);
            } else if (options.history === "replace") {
                window.history.replaceState({}, "", finalUrl);
            }

            window.scrollTo(0, 0);
        } catch (error) {
            window.location.href = targetUrl.href;
        }
    }

    document.addEventListener("click", (event) => {
        const link = event.target.closest("a[href]");
        if (!shouldInterceptLink(link, event)) {
            return;
        }

        event.preventDefault();
        loadPage(link.href, { history: "push" });
    });

    window.addEventListener("popstate", () => {
        loadPage(window.location.href, { history: "replace" });
    });

    window.EnglishStudyNavigation = {
        visit(url, options = {}) {
            return loadPage(url, { history: options.history || "push" });
        },
        initCurrentPage,
    };

    initCurrentPage();
}());
