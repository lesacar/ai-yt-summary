document.addEventListener('DOMContentLoaded', () => {
    const summarizeButton = document.getElementById('summarize');
    const regenerateButton = document.getElementById('regenerate');
    const conciseButton = document.getElementById('concise');
    const detailedButton = document.getElementById('detailed');
    const outputDiv = document.getElementById('output');
    const loader = document.getElementById('loader');
    const cancelButton = document.getElementById('cancel');

    function isYouTubeVideoURL(url) {
        return url && (
            url.match(/youtube\.com\/watch\?v=/) ||
            url.match(/youtu\.be\//)
        );
    }

    // Update the UI by reading state from chrome.storage for the active tab's URL.
    function updateUI(style = null) {
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
                outputDiv.textContent = "";
                loader.style.display = "block";
                regenerateButton.style.display = "none";
                cancelButton.style.display = "block";

                // Send style to background
                chrome.runtime.sendMessage({ 
                    action: "processVideo", 
                    url, 
                    summaryStyle: style 
                }, (response) => {
                        if (response && response.error) {
                            loader.style.display = "none";
                            outputDiv.textContent = `Error: ${response.error}`;
                            cancelButton.style.display = "none";
                        }
                    });
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
    summarizeButton.addEventListener('click', () => updateUI());
    conciseButton.addEventListener('click', () => updateUI('concise'));
    detailedButton.addEventListener('click', () => updateUI('detailed'));

    // Regenerate button: Force a new summarization.
    regenerateButton.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url;
            if (!url || !isYouTubeVideoURL(url)) {
                outputDiv.textContent = "Please navigate to a YouTube video page.";
                return;
            }
            chrome.storage.local.get([url], (result) => {
                const currentStyle = result[url]?.summaryStyle || null;
                chrome.storage.local.remove(url, () => {
                    loader.style.display = "block";
                    outputDiv.textContent = "";
                    summarizeButton.style.display = 'block';
                    regenerateButton.style.display = 'none';
                    cancelButton.style.display = 'none';
                    chrome.runtime.sendMessage({ 
                        action: "processVideo", 
                        url, 
                        summaryStyle: currentStyle 
                    }, (response) => {
                            if (response && response.error) {
                                loader.style.display = "none";
                                outputDiv.textContent = `Error: ${response.error}`;
                            }
                        });
                });
            });
        });
    });

    // Add cancel button handler
    cancelButton.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url;
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

    // As an extra safeguard, poll for data updates (can't edit popup -- it will always re render)
    // setInterval(updateUI, 2000);
});
