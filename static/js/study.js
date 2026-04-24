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

    function normalizeStudyMode(mode) {
        if (mode === "fill" || mode === "line") {
            return mode;
        }
        return "practice";
    }

    function applyTheme(settings) {
        document.documentElement.classList.toggle("dark-mode", Boolean(settings.darkMode));
        document.body.classList.toggle("dark-mode", Boolean(settings.darkMode));
    }

    function updateDarkModeToggle(settings) {
        const toggle = document.getElementById("darkModeToggle");
        if (toggle) {
            toggle.checked = settings.darkMode;
        }
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        }[char]));
    }

    function isAlphaNum(char) {
        if (!char) {
            return false;
        }
        try {
            return /[\p{L}\p{N}]/u.test(char);
        } catch (error) {
            return /[A-Za-z0-9]/.test(char);
        }
    }

    function splitIntoSentences(text) {
        const boundaries = [];
        const quoteStack = [];
        const quotePairs = { '"': '"', "'": "'", "“": "”", "‘": "’" };
        const openQuotes = Object.keys(quotePairs);
        const punctRe = /[.!:?\u3002\uFF1F\uFF01]/;
        let start = 0;

        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            const lastQuote = quoteStack.length ? quoteStack[quoteStack.length - 1] : null;

            if (quotePairs[char] === char) {
                if (lastQuote === char) {
                    quoteStack.pop();
                } else if (char === "'" && isAlphaNum(text[index - 1]) && isAlphaNum(text[index + 1])) {
                    continue;
                } else {
                    quoteStack.push(char);
                }
            } else if (openQuotes.includes(char)) {
                quoteStack.push(char);
            } else if (lastQuote && quotePairs[lastQuote] === char) {
                quoteStack.pop();
            } else if (punctRe.test(char) && quoteStack.length === 0) {
                let end = index + 1;
                while (end < text.length && (punctRe.test(text[end]) || /\s/.test(text[end]))) {
                    end += 1;
                }
                boundaries.push({ start, end });
                start = end;
                index = end - 1;
            }
        }

        if (start < text.length) {
            boundaries.push({ start, end: text.length });
        }

        return {
            boundaries,
            sentences: boundaries.map((boundary) => text.slice(boundary.start, boundary.end).trim()).filter(Boolean),
        };
    }

    function getEnglishLineBoundaries(linePairs, englishText) {
        if (!Array.isArray(linePairs) || !linePairs.length) {
            return splitIntoSentences(englishText).boundaries;
        }

        const boundaries = [];
        let cursor = 0;
        linePairs.forEach((pair) => {
            const englishLine = (pair.english || "").replace(/\*\*/g, "");
            const end = cursor + englishLine.length;
            boundaries.push({ start: cursor, end });
            cursor = end;
            if (englishText[cursor] === "\n") {
                cursor += 1;
            }
        });
        return boundaries;
    }

    function getTranslationLines(linePairs, koreanText) {
        if (Array.isArray(linePairs) && linePairs.length) {
            return linePairs.map((pair) => pair.korean || "");
        }
        return splitIntoSentences(koreanText).sentences;
    }

    function findSentenceIndex(boundaries, cursorIndex) {
        const found = boundaries.findIndex((boundary) => cursorIndex < boundary.end);
        if (found >= 0) {
            return found;
        }
        return boundaries.length ? boundaries.length - 1 : -1;
    }

    function visitHref(href) {
        if (!href) {
            return;
        }
        if (window.EnglishStudyNavigation && typeof window.EnglishStudyNavigation.visit === "function") {
            window.EnglishStudyNavigation.visit(href);
            return;
        }
        window.location.href = href;
    }

    window.EnglishStudyPages = window.EnglishStudyPages || {};
    window.EnglishStudyPages.study = {
        init() {
            if (document.body.dataset.page !== "study") {
                return () => {};
            }

            const studyDataEl = document.getElementById("study-data");
            if (!studyDataEl) {
                return () => {};
            }

            const studyData = JSON.parse(studyDataEl.textContent);
            const state = {
                text: studyData.text,
                mode: normalizeStudyMode(studyData.mode),
                settings: loadSettings(),
                koreanVisible: false,
            };

            let cleanup = () => {};

            function applyKoreanVisibility(hasKorean) {
                document.body.classList.toggle("korean-visible", Boolean(hasKorean && state.koreanVisible));
            }

            function getLinkHref(id) {
                const link = document.getElementById(id);
                return link ? link.href : null;
            }

            function navigateTo(id) {
                visitHref(getLinkHref(id));
            }

            function initializePracticeMode() {
                const englishText = (state.text.english_content || "").replace(/\*\*/g, "");
                const koreanText = state.text.korean_content || "";
                const linePairs = state.text.line_pairs || [];
                const textDisplay = document.getElementById("text-display");
                const switchContainer = document.getElementById("switchContainer");
                const statusText = document.getElementById("statusText");
                const koreanWidget = document.getElementById("korean-widget");
                const cursor = document.getElementById("cursor");

                switchContainer.innerHTML = `
                    <div class="switch-group">
                        <label class="switch"><input type="checkbox" id="toggle-visibility"><span class="slider"></span></label>
                        <label for="toggle-visibility" class="switch-label">미리보기 (Shift+O)</label>
                    </div>
                    <div class="switch-group">
                        <label class="switch"><input type="checkbox" id="toggle-partial-preview"><span class="slider"></span></label>
                        <label for="toggle-partial-preview" class="switch-label">일부 미리보기 (Shift+H)</label>
                    </div>
                    <div class="switch-group">
                        <label class="switch"><input type="checkbox" id="darkModeToggle"><span class="slider"></span></label>
                        <label for="darkModeToggle" class="switch-label">다크모드</label>
                    </div>
                `;
                updateDarkModeToggle(state.settings);

                const visibilityToggle = document.getElementById("toggle-visibility");
                const partialPreviewToggle = document.getElementById("toggle-partial-preview");
                const darkModeToggle = document.getElementById("darkModeToggle");

                visibilityToggle.checked = state.settings.practiceReveal;
                partialPreviewToggle.checked = state.settings.practiceWordHint;
                document.body.classList.toggle("hide-upcoming", !state.settings.practiceReveal);

                const punctuationToSkip = '!"#$%&\\\'()*+,-./:;<=>?@[\\]^_`{|}~\n\t';
                const characters = [];
                const koreanSentences = [];
                const englishBoundaries = getEnglishLineBoundaries(linePairs, englishText);
                let currentIndex = 0;
                let cursorFrame = null;
                let resizeObserver = null;

                textDisplay.appendChild(cursor);
                cursor.style.opacity = "0";
                cursor.style.transform = "translate3d(0, 0, 0)";

                englishText.split("").forEach((char) => {
                    const span = document.createElement("span");
                    span.textContent = char;
                    textDisplay.insertBefore(span, cursor);
                    characters.push(span);
                });

                if (koreanText) {
                    getTranslationLines(linePairs, koreanText).forEach((sentence) => {
                        const span = document.createElement("span");
                        span.innerText = sentence;
                        koreanWidget.appendChild(span);
                        koreanSentences.push(span);
                    });
                }

                function updateStatus() {
                    statusText.textContent = currentIndex >= characters.length
                        ? "완료!"
                        : "타이핑을 시작하세요. (Shift+K: 한글)";
                }

                function updateKoreanHighlight() {
                    if (!koreanSentences.length || !englishBoundaries.length) {
                        return;
                    }
                    const sentenceIndex = findSentenceIndex(englishBoundaries, currentIndex);
                    if (sentenceIndex < 0) {
                        return;
                    }
                    koreanSentences.forEach((span, index) => {
                        const active = index === sentenceIndex;
                        span.classList.toggle("highlight", active);
                        if (active && document.body.classList.contains("korean-visible")) {
                            span.scrollIntoView({ behavior: "smooth", block: "center" });
                        }
                    });
                }

                function skipUntypableCharacters() {
                    while (currentIndex < characters.length) {
                        const charCode = englishText[currentIndex].charCodeAt(0);
                        if (charCode > 126 || (charCode < 32 && charCode !== 9 && charCode !== 10)) {
                            characters[currentIndex].classList.add("correct");
                            currentIndex += 1;
                        } else {
                            break;
                        }
                    }
                }

                function skipPunctuation() {
                    while (currentIndex < characters.length && punctuationToSkip.includes(englishText[currentIndex])) {
                        characters[currentIndex].classList.add("correct");
                        currentIndex += 1;
                    }
                }

                function updatePartialPreview() {
                    characters.forEach((span) => span.classList.remove("partial-preview-active"));
                    if (!state.settings.practiceWordHint) {
                        return;
                    }
                    if (currentIndex < characters.length) {
                        characters[currentIndex].classList.add("partial-preview-active");
                    }
                    let start = currentIndex;
                    while (start < englishText.length && /\s/.test(englishText[start])) {
                        start += 1;
                    }
                    if (start >= englishText.length) {
                        return;
                    }
                    let end = start;
                    while (end < englishText.length && !/\s/.test(englishText[end])) {
                        end += 1;
                    }
                    for (let index = start; index < end; index += 1) {
                        if (characters[index]) {
                            characters[index].classList.add("partial-preview-active");
                        }
                    }
                }

                function getCharacterRect(span) {
                    const rects = span.getClientRects();
                    if (rects.length) {
                        return rects[rects.length - 1];
                    }
                    return span.getBoundingClientRect();
                }

                function getCursorTarget() {
                    if (characters[currentIndex]) {
                        const span = characters[currentIndex];
                        const rect = getCharacterRect(span);
                        const containerRect = textDisplay.getBoundingClientRect();
                        const height = rect.height || Number.parseFloat(getComputedStyle(textDisplay).lineHeight) || 24;
                        return {
                            left: rect.left - containerRect.left + textDisplay.scrollLeft,
                            top: rect.top - containerRect.top + textDisplay.scrollTop,
                            height,
                        };
                    }

                    if (characters.length) {
                        const span = characters[characters.length - 1];
                        const rect = getCharacterRect(span);
                        const containerRect = textDisplay.getBoundingClientRect();
                        const height = rect.height || Number.parseFloat(getComputedStyle(textDisplay).lineHeight) || 24;
                        return {
                            left: rect.right - containerRect.left + textDisplay.scrollLeft,
                            top: rect.top - containerRect.top + textDisplay.scrollTop,
                            height,
                        };
                    }

                    return null;
                }

                function updateCursor(show) {
                    if (!show) {
                        cursor.style.opacity = "0";
                        return;
                    }

                    characters.forEach((span, index) => {
                        span.classList.toggle("current", index === currentIndex);
                    });

                    const target = getCursorTarget();
                    if (!target) {
                        cursor.style.opacity = "0";
                        return;
                    }

                    const cursorHeight = Math.max(12, target.height * 0.8);
                    const cursorTop = target.top + (target.height - cursorHeight) / 2;
                    const cursorLeft = target.left;
                    cursor.style.height = `${cursorHeight}px`;
                    cursor.style.transform = `translate3d(${cursorLeft}px, ${cursorTop}px, 0)`;
                    cursor.style.opacity = "1";
                    updatePartialPreview();
                }

                function scheduleCursorUpdate() {
                    if (cursorFrame !== null) {
                        return;
                    }
                    cursorFrame = requestAnimationFrame(() => {
                        cursorFrame = null;
                        updateCursor(true);
                    });
                }

                function refreshPracticeView() {
                    document.body.classList.toggle("hide-upcoming", !state.settings.practiceReveal);
                    updateStatus();
                    updateKoreanHighlight();
                    updateCursor(true);
                }

                function isSkippable(index) {
                    if (index < 0 || index >= englishText.length) {
                        return false;
                    }
                    const charCode = englishText[index].charCodeAt(0);
                    return punctuationToSkip.includes(englishText[index]) || charCode > 126 || (charCode < 32 && charCode !== 9 && charCode !== 10);
                }

                function handleScroll() {
                    scheduleCursorUpdate();
                }

                function handleKeydown(event) {
                    if (event.shiftKey) {
                        const key = event.key.toLowerCase();
                        if (key === "e") {
                            event.preventDefault();
                            navigateTo("backLink");
                            return;
                        }
                        if (key === "k") {
                            event.preventDefault();
                            if (koreanText) {
                                state.koreanVisible = !state.koreanVisible;
                                applyKoreanVisibility(koreanText);
                                scheduleCursorUpdate();
                            }
                            return;
                        }
                        if (key === "o") {
                            event.preventDefault();
                            state.settings.practiceReveal = !state.settings.practiceReveal;
                            visibilityToggle.checked = state.settings.practiceReveal;
                            if (state.settings.practiceReveal) {
                                state.settings.practiceWordHint = false;
                                partialPreviewToggle.checked = false;
                            }
                            saveSettings(state.settings);
                            refreshPracticeView();
                            return;
                        }
                        if (key === "h") {
                            event.preventDefault();
                            state.settings.practiceWordHint = !state.settings.practiceWordHint;
                            partialPreviewToggle.checked = state.settings.practiceWordHint;
                            if (state.settings.practiceWordHint) {
                                state.settings.practiceReveal = false;
                                visibilityToggle.checked = false;
                            } else {
                                state.settings.practiceReveal = true;
                                visibilityToggle.checked = true;
                            }
                            saveSettings(state.settings);
                            refreshPracticeView();
                            return;
                        }
                    }

                    if (event.ctrlKey) {
                        if (event.key === "ArrowLeft" && getLinkHref("previousTextLink")) {
                            event.preventDefault();
                            navigateTo("previousTextLink");
                        }
                        if (event.key === "ArrowRight" && getLinkHref("nextTextLink")) {
                            event.preventDefault();
                            navigateTo("nextTextLink");
                        }
                        return;
                    }

                    if (event.metaKey || event.altKey) {
                        return;
                    }

                    if (event.key === "Backspace") {
                        event.preventDefault();
                        if (currentIndex > 0) {
                            do {
                                currentIndex -= 1;
                                const span = characters[currentIndex];
                                span.classList.remove("correct", "incorrect");
                                span.textContent = englishText[currentIndex];
                            } while (currentIndex > 0 && isSkippable(currentIndex - 1));
                        }
                        refreshPracticeView();
                        return;
                    }

                    if (event.key.length !== 1) {
                        return;
                    }

                    event.preventDefault();
                    skipUntypableCharacters();
                    if (currentIndex >= characters.length) {
                        refreshPracticeView();
                        return;
                    }

                    const span = characters[currentIndex];
                    const correctChar = englishText[currentIndex];
                    if (event.key.toLowerCase() === correctChar.toLowerCase()) {
                        span.textContent = correctChar;
                        span.classList.remove("incorrect");
                        span.classList.add("correct");
                        currentIndex += 1;
                    } else if (correctChar !== " " && event.key !== " ") {
                        span.textContent = event.key;
                        span.classList.add("incorrect");
                        currentIndex += 1;
                    }

                    skipPunctuation();
                    skipUntypableCharacters();
                    if (currentIndex < characters.length) {
                        characters[currentIndex].scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                    refreshPracticeView();
                }

                function handleVisibilityChange() {
                    state.settings.practiceReveal = visibilityToggle.checked;
                    if (visibilityToggle.checked) {
                        state.settings.practiceWordHint = false;
                        partialPreviewToggle.checked = false;
                    }
                    saveSettings(state.settings);
                    refreshPracticeView();
                }

                function handlePartialPreviewChange() {
                    state.settings.practiceWordHint = partialPreviewToggle.checked;
                    if (partialPreviewToggle.checked) {
                        state.settings.practiceReveal = false;
                        visibilityToggle.checked = false;
                    } else {
                        state.settings.practiceReveal = true;
                        visibilityToggle.checked = true;
                    }
                    saveSettings(state.settings);
                    refreshPracticeView();
                }

                function handleDarkModeChange() {
                    state.settings.darkMode = darkModeToggle.checked;
                    saveSettings(state.settings);
                    applyTheme(state.settings);
                }

                visibilityToggle.addEventListener("change", handleVisibilityChange);
                partialPreviewToggle.addEventListener("change", handlePartialPreviewChange);
                darkModeToggle.addEventListener("change", handleDarkModeChange);
                textDisplay.addEventListener("scroll", handleScroll);
                document.addEventListener("keydown", handleKeydown);

                if ("ResizeObserver" in window) {
                    resizeObserver = new ResizeObserver(scheduleCursorUpdate);
                    resizeObserver.observe(textDisplay);
                }

                applyKoreanVisibility(koreanText);
                skipUntypableCharacters();
                skipPunctuation();
                updateStatus();
                updateKoreanHighlight();
                updateCursor(false);
                scheduleCursorUpdate();
                textDisplay.focus();

                cleanup = () => {
                    if (cursorFrame !== null) {
                        cancelAnimationFrame(cursorFrame);
                    }
                    if (resizeObserver) {
                        resizeObserver.disconnect();
                    }
                    visibilityToggle.removeEventListener("change", handleVisibilityChange);
                    partialPreviewToggle.removeEventListener("change", handlePartialPreviewChange);
                    darkModeToggle.removeEventListener("change", handleDarkModeChange);
                    textDisplay.removeEventListener("scroll", handleScroll);
                    document.removeEventListener("keydown", handleKeydown);
                };
            }

            function initializeFillMode() {
                document.body.classList.remove("hide-upcoming");
                const originalTextContent = state.text.english_content || "";
                const koreanText = state.text.korean_content || "";
                const linePairs = state.text.line_pairs || [];
                const textDisplay = document.getElementById("text-display");
                const switchContainer = document.getElementById("switchContainer");
                const statusText = document.getElementById("statusText");
                const koreanWidget = document.getElementById("korean-widget");
                const cursor = document.getElementById("cursor");
                cursor.style.opacity = "0";

                switchContainer.innerHTML = `
                    <div class="switch-group">
                        <label class="switch"><input type="checkbox" id="toggle-preview"><span class="slider"></span></label>
                        <label for="toggle-preview" class="switch-label">미리보기 (Shift+H)</label>
                    </div>
                    <div class="switch-group">
                        <label class="switch"><input type="checkbox" id="toggle-first-letter"><span class="slider"></span></label>
                        <label for="toggle-first-letter" class="switch-label">앞글자만 보기 (Shift+I)</label>
                    </div>
                    <div class="switch-group">
                        <label class="switch"><input type="checkbox" id="darkModeToggle"><span class="slider"></span></label>
                        <label for="darkModeToggle" class="switch-label">다크모드</label>
                    </div>
                `;
                updateDarkModeToggle(state.settings);

                const previewToggle = document.getElementById("toggle-preview");
                const firstLetterToggle = document.getElementById("toggle-first-letter");
                const darkModeToggle = document.getElementById("darkModeToggle");

                previewToggle.checked = state.settings.fillPreview;
                firstLetterToggle.checked = state.settings.fillFirstLetter;

                const blanks = [];
                const koreanSentences = [];
                const engBoundaries = getEnglishLineBoundaries(linePairs, originalTextContent.replace(/\*\*/g, ""));
                const engToKorMap = engBoundaries.map((_, index) => index);
                let currentBlankIndex = -1;

                if (koreanText) {
                    getTranslationLines(linePairs, koreanText).forEach((sentence, index) => {
                        const span = document.createElement("span");
                        span.innerText = sentence;
                        span.dataset.korIndex = String(index);
                        koreanWidget.appendChild(span);
                        koreanSentences.push(span);
                    });
                }

                function updateStatus() {
                    const allCorrect = blanks.length > 0 && blanks.every((input) =>
                        (input.value || "").toLowerCase() === (input.dataset.correct || "").toLowerCase()
                    );
                    statusText.textContent = allCorrect ? "완료!" : "빈칸을 채우세요.";
                }

                function updateKoreanHighlight() {
                    if (!koreanSentences.length || currentBlankIndex < 0 || currentBlankIndex >= blanks.length) {
                        return;
                    }

                    const currentBlank = blanks[currentBlankIndex];
                    const engIndex = Number.parseInt(currentBlank.dataset.engSentenceIndex || "-1", 10);
                    if (Number.isNaN(engIndex) || engIndex < 0) {
                        return;
                    }

                    const korIndex = engToKorMap[engIndex];
                    if (korIndex === undefined || korIndex >= koreanSentences.length) {
                        return;
                    }

                    koreanSentences.forEach((span, index) => {
                        span.classList.toggle("highlight", index === korIndex);
                    });

                    if (document.body.classList.contains("korean-visible")) {
                        koreanSentences[korIndex].scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                }

                function updatePreview() {
                    const activeInput = currentBlankIndex >= 0 ? blanks[currentBlankIndex] : null;
                    blanks.forEach((input) => {
                        const wrapper = input.parentElement;
                        const previewSpan = wrapper.querySelector(".preview-span");
                        const showPreview = input === activeInput && (state.settings.fillPreview || state.settings.fillFirstLetter);
                        if (showPreview) {
                            previewSpan.innerText = state.settings.fillFirstLetter
                                ? (input.dataset.correct || "").charAt(0)
                                : (input.dataset.correct || "");
                        } else {
                            previewSpan.innerText = "";
                        }
                        wrapper.classList.toggle("preview-mode", showPreview);
                        input.classList.toggle("active", input === activeInput);
                        input.readOnly = showPreview;
                    });
                }

                function focusAndScroll(index) {
                    if (index >= 0 && index < blanks.length) {
                        currentBlankIndex = index;
                        const input = blanks[index];
                        input.focus();
                        input.scrollIntoView({ behavior: "smooth", block: "center" });
                        updatePreview();
                        updateKoreanHighlight();
                    }
                }

                function renderText() {
                    textDisplay.innerHTML = "";
                    const blankRegex = /\*\*(.*?)\*\*/g;
                    let match;
                    let lastIndex = 0;
                    let plainTextCursor = 0;

                    while ((match = blankRegex.exec(originalTextContent)) !== null) {
                        const precedingText = originalTextContent.substring(lastIndex, match.index);
                        if (precedingText) {
                            textDisplay.appendChild(document.createTextNode(precedingText));
                            plainTextCursor += precedingText.length;
                        }

                        const word = match[1];
                        const wrapper = document.createElement("span");
                        wrapper.classList.add("blank-wrapper");

                        const input = document.createElement("input");
                        input.type = "text";
                        input.classList.add("blank-input");
                        input.dataset.correct = word;
                        input.style.width = `${Math.max(1, word.length) * 1.1}ch`;

                        let sentenceIndex = engBoundaries.findIndex((boundary) => plainTextCursor < boundary.end);
                        if (sentenceIndex === -1) {
                            sentenceIndex = engBoundaries.length ? engBoundaries.length - 1 : 0;
                        }
                        input.dataset.engSentenceIndex = String(sentenceIndex);

                        const previewSpan = document.createElement("span");
                        previewSpan.classList.add("preview-span");

                        wrapper.appendChild(input);
                        wrapper.appendChild(previewSpan);
                        textDisplay.appendChild(wrapper);
                        blanks.push(input);

                        lastIndex = blankRegex.lastIndex;
                        plainTextCursor += word.length;
                    }

                    if (lastIndex < originalTextContent.length) {
                        textDisplay.appendChild(document.createTextNode(originalTextContent.substring(lastIndex)));
                    }
                }

                function handleInput(event) {
                    const input = event.target;
                    const answer = (input.dataset.correct || "").toLowerCase();
                    const value = (input.value || "").toLowerCase();
                    input.classList.toggle("correct", value === answer);
                    input.classList.toggle("incorrect", Boolean(value) && value !== answer);
                    updateStatus();
                }

                function handleFocus(event) {
                    currentBlankIndex = blanks.indexOf(event.target);
                    updatePreview();
                    updateKoreanHighlight();
                }

                function handleBlur() {
                    setTimeout(() => {
                        if (!textDisplay.contains(document.activeElement)) {
                            currentBlankIndex = -1;
                            updatePreview();
                        }
                    }, 0);
                }

                function handleKeydown(event) {
                    if (event.shiftKey) {
                        const key = event.key.toLowerCase();
                        if (key === "e") {
                            event.preventDefault();
                            navigateTo("backLink");
                            return;
                        }
                        if (key === "k") {
                            event.preventDefault();
                            if (koreanText) {
                                state.koreanVisible = !state.koreanVisible;
                                applyKoreanVisibility(koreanText);
                                updateKoreanHighlight();
                            }
                            return;
                        }
                        if (key === "h") {
                            event.preventDefault();
                            state.settings.fillPreview = !state.settings.fillPreview;
                            if (state.settings.fillPreview) {
                                state.settings.fillFirstLetter = false;
                            }
                            previewToggle.checked = state.settings.fillPreview;
                            firstLetterToggle.checked = state.settings.fillFirstLetter;
                            saveSettings(state.settings);
                            updatePreview();
                            return;
                        }
                        if (key === "i") {
                            event.preventDefault();
                            state.settings.fillFirstLetter = !state.settings.fillFirstLetter;
                            if (state.settings.fillFirstLetter) {
                                state.settings.fillPreview = false;
                            }
                            previewToggle.checked = state.settings.fillPreview;
                            firstLetterToggle.checked = state.settings.fillFirstLetter;
                            saveSettings(state.settings);
                            updatePreview();
                            return;
                        }
                        if (event.key === "ArrowRight") {
                            event.preventDefault();
                            focusAndScroll(currentBlankIndex + 1);
                            return;
                        }
                        if (event.key === "ArrowLeft") {
                            event.preventDefault();
                            focusAndScroll(currentBlankIndex - 1);
                            return;
                        }
                    }

                    if (event.ctrlKey) {
                        if (event.key === "ArrowLeft" && getLinkHref("previousTextLink")) {
                            event.preventDefault();
                            navigateTo("previousTextLink");
                        }
                        if (event.key === "ArrowRight" && getLinkHref("nextTextLink")) {
                            event.preventDefault();
                            navigateTo("nextTextLink");
                        }
                        return;
                    }

                    if (event.key === "Enter") {
                        event.preventDefault();
                        if (currentBlankIndex < blanks.length - 1) {
                            focusAndScroll(currentBlankIndex + 1);
                        }
                    }
                }

                function handlePreviewChange() {
                    state.settings.fillPreview = previewToggle.checked;
                    if (previewToggle.checked) {
                        state.settings.fillFirstLetter = false;
                        firstLetterToggle.checked = false;
                    }
                    saveSettings(state.settings);
                    updatePreview();
                }

                function handleFirstLetterChange() {
                    state.settings.fillFirstLetter = firstLetterToggle.checked;
                    if (firstLetterToggle.checked) {
                        state.settings.fillPreview = false;
                        previewToggle.checked = false;
                    }
                    saveSettings(state.settings);
                    updatePreview();
                }

                function handleDarkModeChange() {
                    state.settings.darkMode = darkModeToggle.checked;
                    saveSettings(state.settings);
                    applyTheme(state.settings);
                }

                renderText();
                blanks.forEach((input) => {
                    input.addEventListener("input", handleInput);
                    input.addEventListener("focus", handleFocus);
                    input.addEventListener("blur", handleBlur);
                });

                previewToggle.addEventListener("change", handlePreviewChange);
                firstLetterToggle.addEventListener("change", handleFirstLetterChange);
                darkModeToggle.addEventListener("change", handleDarkModeChange);
                document.addEventListener("keydown", handleKeydown);

                applyKoreanVisibility(koreanText);
                updateStatus();
                if (blanks.length) {
                    focusAndScroll(0);
                }

                cleanup = () => {
                    blanks.forEach((input) => {
                        input.removeEventListener("input", handleInput);
                        input.removeEventListener("focus", handleFocus);
                        input.removeEventListener("blur", handleBlur);
                    });
                    previewToggle.removeEventListener("change", handlePreviewChange);
                    firstLetterToggle.removeEventListener("change", handleFirstLetterChange);
                    darkModeToggle.removeEventListener("change", handleDarkModeChange);
                    document.removeEventListener("keydown", handleKeydown);
                };
            }

            function initializeLineMode() {
                document.body.classList.remove("hide-upcoming", "korean-visible");
                document.body.classList.add("line-mode-active");
                state.koreanVisible = false;

                const textDisplay = document.getElementById("text-display");
                const switchContainer = document.getElementById("switchContainer");
                const statusText = document.getElementById("statusText");
                const koreanWidget = document.getElementById("korean-widget");
                const cursor = document.getElementById("cursor");
                const englishText = (state.text.english_content || "").replace(/\*\*/g, "");
                const koreanText = state.text.korean_content || "";
                const linePairs = state.text.line_pairs || [];
                let activeIndex = 0;
                let resizeObserver = null;

                cursor.style.opacity = "0";
                koreanWidget.innerHTML = "";
                switchContainer.innerHTML = `
                    <div class="switch-group line-mode-help">↑/↓ 문장 이동</div>
                    <div class="switch-group">
                        <label class="switch"><input type="checkbox" id="darkModeToggle"><span class="slider"></span></label>
                        <label for="darkModeToggle" class="switch-label">다크모드</label>
                    </div>
                `;
                updateDarkModeToggle(state.settings);

                const darkModeToggle = document.getElementById("darkModeToggle");
                const englishLines = Array.isArray(linePairs) && linePairs.length
                    ? linePairs.map((pair) => (pair.english || "").replace(/\*\*/g, ""))
                    : splitIntoSentences(englishText).sentences;
                const koreanLines = Array.isArray(linePairs) && linePairs.length
                    ? linePairs.map((pair) => pair.korean || "")
                    : getTranslationLines(linePairs, koreanText);
                const maxLineCount = Math.max(englishLines.length, koreanLines.length);
                const lineEntries = Array.from({ length: maxLineCount }, (_, index) => ({
                    english: englishLines[index] || "",
                    korean: koreanLines[index] || "해석 없음",
                }));
                const cards = [];

                textDisplay.innerHTML = `
                    <div class="line-camera" id="line-camera">
                        <div class="line-scene" id="line-scene"></div>
                    </div>
                `;

                const camera = document.getElementById("line-camera");
                const scene = document.getElementById("line-scene");

                function updateStatus() {
                    statusText.textContent = maxLineCount
                        ? `${activeIndex + 1} / ${maxLineCount} 한줄 해석`
                        : "표시할 문장이 없습니다.";
                }

                function renderScene() {
                    scene.innerHTML = "";
                    cards.length = 0;

                    if (!lineEntries.length) {
                        const emptyState = document.createElement("article");
                        emptyState.className = "line-scene-card empty";
                        emptyState.innerHTML = '<p class="line-empty-text">표시할 문장이 없습니다.</p>';
                        scene.appendChild(emptyState);
                        return;
                    }

                    lineEntries.forEach((entry, index) => {
                        const card = document.createElement("article");
                        card.className = "line-scene-card";
                        card.dataset.index = String(index);
                        card.innerHTML = `
                            <div class="line-card-order">${String(index + 1).padStart(2, "0")}</div>
                            <div class="line-card-body">
                                <p class="line-card-english">${escapeHtml(entry.english || "")}</p>
                                <p class="line-card-korean">${escapeHtml(entry.korean || "해석 없음")}</p>
                            </div>
                        `;
                        card.addEventListener("click", () => setActiveLine(index));
                        scene.appendChild(card);
                        cards.push(card);
                    });
                }

                function updateCardStates() {
                    cards.forEach((card, index) => {
                        const distance = index - activeIndex;
                        const absolute = Math.abs(distance);
                        card.classList.toggle("active", distance === 0);
                        card.classList.toggle("near", absolute === 1);
                        card.classList.toggle("far", absolute >= 2);
                        card.classList.toggle("before-active", distance < 0);
                        card.classList.toggle("after-active", distance > 0);
                    });
                }

                function syncScenePadding() {
                    const firstCard = cards[0];
                    const lastCard = cards[cards.length - 1];
                    if (!firstCard || !lastCard) {
                        return;
                    }

                    const topPadding = Math.max(24, (camera.clientHeight - firstCard.offsetHeight) / 2);
                    const bottomPadding = Math.max(24, (camera.clientHeight - lastCard.offsetHeight) / 2);
                    scene.style.paddingTop = `${topPadding}px`;
                    scene.style.paddingBottom = `${bottomPadding}px`;
                }

                function updateCamera(animate = true) {
                    const activeCard = cards[activeIndex];
                    if (!activeCard) {
                        scene.style.transform = "translateY(0)";
                        updateStatus();
                        return;
                    }

                    const target = activeCard.offsetTop - ((camera.clientHeight - activeCard.offsetHeight) / 2);
                    scene.style.transition = animate ? "" : "none";
                    scene.style.transform = `translateY(${-Math.max(0, target)}px)`;
                    if (!animate) {
                        void scene.offsetHeight;
                        scene.style.transition = "";
                    }
                    updateStatus();
                }

                function setActiveLine(index, animate = true) {
                    if (!maxLineCount) {
                        updateStatus();
                        return;
                    }
                    const nextIndex = Math.min(Math.max(index, 0), maxLineCount - 1);
                    if (nextIndex === activeIndex) {
                        updateCardStates();
                        updateCamera(animate);
                        return;
                    }
                    activeIndex = nextIndex;
                    updateCardStates();
                    updateCamera(animate);
                }

                function handleKeydown(event) {
                    if (event.shiftKey && event.key.toLowerCase() === "e") {
                        event.preventDefault();
                        navigateTo("backLink");
                        return;
                    }

                    if (event.ctrlKey) {
                        if (event.key === "ArrowLeft" && getLinkHref("previousTextLink")) {
                            event.preventDefault();
                            navigateTo("previousTextLink");
                            return;
                        }
                        if (event.key === "ArrowRight" && getLinkHref("nextTextLink")) {
                            event.preventDefault();
                            navigateTo("nextTextLink");
                            return;
                        }
                    }

                    if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setActiveLine(activeIndex + 1);
                        return;
                    }
                    if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setActiveLine(activeIndex - 1);
                        return;
                    }
                    if (event.key === "Home") {
                        event.preventDefault();
                        setActiveLine(0);
                        return;
                    }
                    if (event.key === "End") {
                        event.preventDefault();
                        setActiveLine(maxLineCount - 1);
                    }
                }

                function handleDarkModeChange() {
                    state.settings.darkMode = darkModeToggle.checked;
                    saveSettings(state.settings);
                    applyTheme(state.settings);
                    requestAnimationFrame(() => {
                        syncScenePadding();
                        updateCamera(false);
                    });
                }

                renderScene();
                updateCardStates();
                syncScenePadding();
                updateCamera(false);
                textDisplay.focus();
                darkModeToggle.addEventListener("change", handleDarkModeChange);

                if ("ResizeObserver" in window) {
                    resizeObserver = new ResizeObserver(() => {
                        syncScenePadding();
                        updateCamera(false);
                    });
                    resizeObserver.observe(camera);
                    resizeObserver.observe(scene);
                    cards.forEach((card) => resizeObserver.observe(card));
                }

                document.addEventListener("keydown", handleKeydown);

                cleanup = () => {
                    if (resizeObserver) {
                        resizeObserver.disconnect();
                    }
                    darkModeToggle.removeEventListener("change", handleDarkModeChange);
                    document.removeEventListener("keydown", handleKeydown);
                };
            }

            function initializeStudyPage() {
                applyTheme(state.settings);
                updateDarkModeToggle(state.settings);
                document.body.classList.toggle("line-mode-active", state.mode === "line");

                if (state.mode === "fill") {
                    initializeFillMode();
                } else if (state.mode === "line") {
                    initializeLineMode();
                } else {
                    initializePracticeMode();
                }
            }

            initializeStudyPage();

            return () => {
                cleanup();
                document.body.classList.remove("hide-upcoming", "korean-visible", "line-mode-active");
            };
        },
    };
}());
