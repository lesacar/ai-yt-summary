document.addEventListener('DOMContentLoaded', () => {
    const summarizeButton = document.getElementById('summarize');
    const regenerateButton = document.getElementById('regenerate');
    const conciseButton = document.getElementById('concise');
    const detailedButton = document.getElementById('detailed');
    const outputDiv = document.getElementById('output');
    const outputContent = document.getElementById('output-content');
    const loader = document.getElementById('loader');
    const cancelButton = document.getElementById('cancel');
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    const fontSizeValue = document.getElementById('fontSizeValue');
    const copyButton = document.getElementById('copy');
    const menuButton = document.getElementById('menu-btn');
    const menu = document.getElementById('menu');
    const menuSettings = document.getElementById('menu-settings');
    const menuRefreshTranscript = document.getElementById('menu-refresh-transcript');
    const menuClear = document.getElementById('menu-clear');
    const TRANSCRIPT_CACHE_PREFIX = 'transcript:';

    function isYouTubeVideoURL(url) {
        return url && (
            url.match(/youtube\.com\/watch\?v=/) ||
            url.match(/youtu\.be\//)
        );
    }

    function updateUI() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url?.trim();
            if (!url || !isYouTubeVideoURL(url)) {
                outputContent.textContent = "Please navigate to a YouTube video page.";
                summarizeButton.disabled = true;
                summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                regenerateButton.disabled = true;
                cancelButton.disabled = true;
                copyButton.disabled = true;
                loader.style.display = 'none';
                return;
            }

            chrome.storage.local.get([url], (result) => {
                const data = result[url];
                loader.style.display = 'none';

                if (data) {
                    if (data.processing) {
                        outputContent.textContent = "Processing...";
                        loader.style.display = 'block';
                        summarizeButton.disabled = true;
                        summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                        regenerateButton.disabled = true;
                        cancelButton.disabled = false;
                        copyButton.disabled = true;
                        return;
                    } else if (data.summary) {
                        if (data.summary.startsWith("Error:")) {
                            outputContent.textContent = data.summary;
                            summarizeButton.disabled = false;
                            summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                            regenerateButton.disabled = true;
                            copyButton.disabled = true;
                        } else {
                            outputContent.innerHTML = data.summary;
                            summarizeButton.disabled = true;
                            summarizeButton.setAttribute('data-tooltip', 'Use the buttons below after first generation');
                            regenerateButton.disabled = false;
                            copyButton.disabled = false;
                        }
                        cancelButton.disabled = true;
                        return;
                    }
                }

                outputContent.textContent = "Click ✨ to generate a summary.";
                summarizeButton.disabled = false;
                summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                regenerateButton.disabled = true;
                cancelButton.disabled = true;
                copyButton.disabled = true;
            });
        });
    }

    // Font size slider
    function applyFontSize(size) {
        outputDiv.style.fontSize = size + 'px';
        fontSizeValue.textContent = size + 'px';
    }

    chrome.storage.sync.get('fontSize', (result) => {
        const size = result.fontSize || 16;
        fontSizeSlider.value = size;
        applyFontSize(size);
    });

    fontSizeSlider.addEventListener('input', () => {
        const size = parseInt(fontSizeSlider.value);
        applyFontSize(size);
        chrome.storage.sync.set({ fontSize: size });
    });

    function startProcessing(style = null) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url?.trim();
            if (!url || !isYouTubeVideoURL(url)) {
                outputContent.textContent = "Please navigate to a YouTube video page.";
                return;
            }

            chrome.storage.local.get([url], (result) => {
                const data = result[url];
                if (data && data.processing) {
                    outputContent.textContent = "Already processing...";
                    return;
                }

                outputContent.textContent = "";
                loader.style.display = "block";
                summarizeButton.disabled = true;
                summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                regenerateButton.disabled = true;
                cancelButton.disabled = false;
                copyButton.disabled = true;

                chrome.runtime.sendMessage({ 
                    action: "processVideo", 
                    url, 
                    summaryStyle: style 
                }, (response) => {
                    if (response && response.error) {
                        loader.style.display = "none";
                        outputContent.textContent = `Error: ${response.error}`;
                        cancelButton.disabled = true;
                        summarizeButton.disabled = false;
                        summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                        copyButton.disabled = true;
                    }
                });
            });
        });
    }

    function getActiveVideoUrl() {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                resolve(tabs[0]?.url?.trim() || null);
            });
        });
    }

    function closeMenu() {
        menu.classList.remove('open');
    }

    async function refreshMenuItems() {
        const url = await getActiveVideoUrl();
        const valid = url && isYouTubeVideoURL(url);
        if (!valid) {
            menuRefreshTranscript.disabled = true;
            menuClear.disabled = true;
            return;
        }
        const cacheKey = TRANSCRIPT_CACHE_PREFIX + url;
        const result = await chrome.storage.local.get([url, cacheKey]);
        menuRefreshTranscript.disabled = !result[cacheKey];
        menuClear.disabled = !result[url] && !result[cacheKey];
    }

    menuButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        const opening = !menu.classList.contains('open');
        closeMenu();
        if (!opening) return;
        menu.classList.add('open');
        await refreshMenuItems();
    });

    document.addEventListener('click', (event) => {
        if (!menu.contains(event.target) && event.target !== menuButton) closeMenu();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMenu();
    });

    menuSettings.addEventListener('click', () => {
        closeMenu();
        chrome.runtime.openOptionsPage();
    });

    menuRefreshTranscript.addEventListener('click', async () => {
        const url = await getActiveVideoUrl();
        if (!url || !isYouTubeVideoURL(url)) return;
        const result = await chrome.storage.local.get([url]);
        const previous = result[url];
        if (previous && previous.processing) {
            closeMenu();
            outputContent.textContent = "Already processing...";
            return;
        }
        await chrome.storage.local.remove([TRANSCRIPT_CACHE_PREFIX + url, url]);
        closeMenu();
        startProcessing(previous?.summaryStyle || null);
    });

    menuClear.addEventListener('click', async () => {
        const url = await getActiveVideoUrl();
        if (!url || !isYouTubeVideoURL(url)) return;
        await chrome.storage.local.remove([TRANSCRIPT_CACHE_PREFIX + url, url]);
        closeMenu();
        updateUI();
    });

    updateUI();

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "updateUI") {
            updateUI();
        }
    });

    summarizeButton.addEventListener('click', () => startProcessing());
    conciseButton.addEventListener('click', () => startProcessing('concise'));
    detailedButton.addEventListener('click', () => startProcessing('detailed'));

    copyButton.addEventListener('click', () => {
        if (copyButton.disabled) return;
        const text = outputContent.textContent || outputContent.innerText;
        navigator.clipboard.writeText(text).then(() => {
            copyButton.classList.add('flash-success');
            setTimeout(() => copyButton.classList.remove('flash-success'), 1500);
        });
    });

    regenerateButton.addEventListener('click', () => {
        if (regenerateButton.disabled) return;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url?.trim();
            if (!url || !isYouTubeVideoURL(url)) {
                outputContent.textContent = "Please navigate to a YouTube video page.";
                return;
            }

            chrome.storage.local.remove(url, () => {
                startProcessing();
            });
        });
    });

    cancelButton.addEventListener('click', () => {
        if (cancelButton.disabled) return;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url?.trim();
            if (!url) return;
            
            chrome.storage.local.remove(url, () => {
                loader.style.display = "none";
                outputContent.textContent = "Generation cancelled";
                summarizeButton.disabled = false;
                summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                regenerateButton.disabled = true;
                cancelButton.disabled = true;
                copyButton.disabled = true;
            });
        });
    });
});
