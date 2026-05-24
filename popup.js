document.addEventListener('DOMContentLoaded', () => {
    const summarizeButton = document.getElementById('summarize');
    const regenerateButton = document.getElementById('regenerate');
    const conciseButton = document.getElementById('concise');
    const detailedButton = document.getElementById('detailed');
    const outputDiv = document.getElementById('output');
    const loader = document.getElementById('loader');
    const cancelButton = document.getElementById('cancel');
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    const fontSizeValue = document.getElementById('fontSizeValue');

    function isYouTubeVideoURL(url) {
        return url && (
            url.match(/youtube\.com\/watch\?v=/) ||
            url.match(/youtu\.be\//)
        );
    }

    // ONLY update the UI display - never trigger processing
    function updateUI() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url?.trim();
            if (!url || !isYouTubeVideoURL(url)) {
                outputDiv.textContent = "Please navigate to a YouTube video page.";
                summarizeButton.disabled = true;
                regenerateButton.style.display = 'none';
                cancelButton.style.display = 'none';
                loader.style.display = 'none';
                return;
            }

            summarizeButton.disabled = false;
            chrome.storage.local.get([url], (result) => {
                const data = result[url];
                loader.style.display = 'none';
                cancelButton.style.display = 'none';

                if (data) {
                    if (data.processing) {
                        outputDiv.textContent = "Processing...";
                        loader.style.display = 'block';
                        summarizeButton.style.display = 'none';
                        regenerateButton.style.display = 'none';
                        cancelButton.style.display = 'block';
                    } else if (data.summary) {
                        if (data.summary.startsWith("Error:")) {
                            outputDiv.textContent = data.summary;
                            summarizeButton.style.display = 'block';
                            regenerateButton.style.display = 'none';
                        } else {
                            outputDiv.innerHTML = data.summary;
                            summarizeButton.style.display = 'none';
                            regenerateButton.style.display = 'block';
                        }
                    } else {
                        outputDiv.textContent = "Click ✨ to generate a summary.";
                        summarizeButton.style.display = 'block';
                        regenerateButton.style.display = 'none';
                    }
                } else {
                    outputDiv.textContent = "Click ✨ to generate a summary.";
                    summarizeButton.style.display = 'block';
                    regenerateButton.style.display = 'none';
                }
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

    // Function to start processing (only called by user actions)
    function startProcessing(style = null) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url?.trim();
            if (!url || !isYouTubeVideoURL(url)) {
                outputDiv.textContent = "Please navigate to a YouTube video page.";
                return;
            }

            chrome.storage.local.get([url], (result) => {
                const data = result[url];
                if (data && data.processing) {
                    outputDiv.textContent = "Already processing...";
                    return;
                }

                outputDiv.textContent = "";
                loader.style.display = "block";
                summarizeButton.style.display = 'none';
                regenerateButton.style.display = 'none';
                cancelButton.style.display = 'block';

                chrome.runtime.sendMessage({ 
                    action: "processVideo", 
                    url, 
                    summaryStyle: style 
                }, (response) => {
                    if (response && response.error) {
                        loader.style.display = "none";
                        outputDiv.textContent = `Error: ${response.error}`;
                        cancelButton.style.display = 'none';
                        summarizeButton.style.display = 'block';
                    }
                });
            });
        });
    }

    updateUI();

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "updateUI") {
            updateUI();
        }
    });

    summarizeButton.addEventListener('click', () => startProcessing());
    conciseButton.addEventListener('click', () => startProcessing('concise'));
    detailedButton.addEventListener('click', () => startProcessing('detailed'));

    regenerateButton.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url?.trim();
            if (!url || !isYouTubeVideoURL(url)) {
                outputDiv.textContent = "Please navigate to a YouTube video page.";
                return;
            }
            
            chrome.storage.local.get([url], (result) => {
                const currentStyle = result[url]?.summaryStyle || null;
                chrome.storage.local.remove(url, () => {
                    startProcessing(currentStyle);
                });
            });
        });
    });

    cancelButton.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url?.trim();
            if (!url) return;
            
            chrome.storage.local.remove(url, () => {
                loader.style.display = "none";
                outputDiv.textContent = "Generation cancelled";
                summarizeButton.style.display = 'block';
                regenerateButton.style.display = 'none';
                cancelButton.style.display = 'none';
            });
        });
    });
});
