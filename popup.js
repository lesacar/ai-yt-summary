document.addEventListener('DOMContentLoaded', () => {
    const summarizeButton = document.getElementById('summarize');
    const regenerateButton = document.getElementById('regenerate');
    const outputDiv = document.getElementById('output');
    const loader = document.getElementById('loader');

    function isYouTubeVideoURL(url) {
        return url && (
            url.match(/youtube\.com\/watch\?v=/) ||
            url.match(/youtu\.be\//)
        );
    }

    // Update the UI by reading state from chrome.storage for the active tab's URL.
    function updateUI() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0] || !isYouTubeVideoURL(tabs[0].url)) {
                outputDiv.textContent = "Please navigate to a YouTube video page.";
                summarizeButton.disabled = true;
                regenerateButton.style.display = 'none';
                return;
            }

            const url = tabs[0].url;
            chrome.storage.local.get([url], (result) => {
                loader.style.display = "none";
                const data = result[url];
                if (data) {
                    if (data.processing) {
                        outputDiv.textContent = "Processing...";
                        summarizeButton.disabled = true;
                        regenerateButton.style.display = 'none';
                        loader.style.display = "block";
                    } else if (data.summary) {
                        outputDiv.textContent = data.summary;
                        summarizeButton.style.display = 'none';
                        regenerateButton.style.display = 'block';
                        summarizeButton.disabled = false;
                    } else {
                        outputDiv.textContent = "No summary available.";
                        summarizeButton.disabled = false;
                        summarizeButton.style.display = 'block';
                        regenerateButton.style.display = 'none';
                    }
                } else {
                    outputDiv.textContent = "Click 'Summarize' to generate a summary.";
                    summarizeButton.style.display = 'block';
                    regenerateButton.style.display = 'none';
                    summarizeButton.disabled = false;
                }
            });
        });
    }

    // Immediately update the UI when the popup opens.
    updateUI();

    // Listen for background script messages to update the UI.
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "updateUI") {
            updateUI();
        }
    });

    // Summarize button: If not already processing, trigger a new summarization.
    summarizeButton.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url;
            if (!url || !isYouTubeVideoURL(url)) {
                outputDiv.textContent = "Please navigate to a YouTube video page.";
                return;
            }
            chrome.storage.local.get([url], (result) => {
                if (result[url] && result[url].processing) {
                    outputDiv.textContent = "Already processing...";
                    return;
                }
                // Clear previous output and show the loader.
                outputDiv.textContent = "";
                loader.style.display = "block";
                regenerateButton.style.display = "none";
                // Initiate processing by messaging the background.
                chrome.runtime.sendMessage({ action: "processVideo", url }, (response) => {
                    if (response && response.error) {
                        loader.style.display = "none";
                        outputDiv.textContent = `Error: ${response.error}`;
                    }
                });
            });
        });
    });

    // Regenerate button: Force a new summarization.
    regenerateButton.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url;
            if (!url || !isYouTubeVideoURL(url)) {
                outputDiv.textContent = "Please navigate to a YouTube video page.";
                return;
            }
            // Remove the stored summary then initiate processing.
            chrome.storage.local.remove(url, () => {
                loader.style.display = "block";
                outputDiv.textContent = "";
                summarizeButton.style.display = 'block';
                regenerateButton.style.display = 'none';
                chrome.runtime.sendMessage({ action: "processVideo", url }, (response) => {
                    if (response && response.error) {
                        loader.style.display = "none";
                        outputDiv.textContent = `Error: ${response.error}`;
                    }
                });
            });
        });
    });

    // As an extra safeguard, poll for data updates
    setInterval(updateUI, 2000);
});
