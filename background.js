chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "processVideo") {
        console.log('Received processVideo request for URL:', request.url);
        processVideo(request.url)
            .then(() => {
                console.log('Processing completed successfully');
                sendResponse({ status: "complete" });
            })
            .catch(error => {
                console.error('Processing failed:', error);
                sendResponse({ error: error.message });
            });
        return true;
    }
});

const processingVideos = {}; // prevent multiple simultaneous summarizations

async function processVideo(url) {
    if (processingVideos[url]) {
        console.log('Already processing this URL');
        throw new Error("Video already being processed");
    }
    processingVideos[url] = true;
    try {
        console.log('Starting video processing');
        await chrome.storage.local.set({ [url]: { summary: null, processing: true } });
        
        console.log('Fetching transcript...');
        const transcript = await fetchTranscript(url);
        if (!transcript) {
            throw new Error("Received empty transcript from server");
        }
        console.log('Transcript received:', transcript.substring(0, 100) + '...');
        
        console.log('Fetching AI completion...');
        const summary = await fetchAICompletion(transcript);
        if (!summary) {
            throw new Error("No content received from AI");
        }
        console.log('Summary received:', summary.substring(0, 100) + '...');
        
        await chrome.storage.local.set({
            [url]: { summary: summary, processing: false }
        });
        console.log('Summary saved to storage');
        
        chrome.runtime.sendMessage({ action: "updateUI", url: url });
        
    } catch (error) {
        console.error('Error in processVideo:', error);
        await chrome.storage.local.set({
            [url]: { summary: `Error: ${error.message}`, processing: false }
        });
        chrome.runtime.sendMessage({ action: "updateUI", url: url });
        throw error;
    } finally {
        delete processingVideos[url];
    }
}

async function fetchTranscript(url) {
    console.log('Making request to transcript server...');
    const settings = await chrome.storage.local.get(['transcriptServer']);
    const serverUrl = settings.transcriptServer || 'http://localhost:5000/get_transcript';
    
    try {
        const response = await fetch(serverUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Transcript server error:', error);
            throw new Error(`Transcript server: ${error}`);
        }
        
        const data = await response.json();
        console.log('Transcript server response:', data);
        
        if (!data || !data.text) {
            throw new Error("Invalid response format from transcript server");
        }
        
        return data.text;
    } catch (error) {
        console.error('Error in fetchTranscript:', error);
        throw error;
    }
}

async function processChunks(transcript, modelName, apiKey, baseUrl) {
    const MAX_CHUNK_SIZE = 16000;
    const chunks = [];
    for (let i = 0; i < transcript.length; i += MAX_CHUNK_SIZE) {
        chunks.push(transcript.slice(i, i + MAX_CHUNK_SIZE));
    }
    
    console.log(`Processing ${chunks.length} chunks`);
    
    let fullSummary = '';
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        let retries = 3;
        
        while (retries > 0) {
            try {
                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                const response = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [{
                            role: 'system',
                            content: 'Output a concise bullet-point summary. Focus on key facts and events. Be direct and objective.'
                        }, {
                            role: 'user',
                            content: chunk
                        }],
                        stream: true
                    })
                });
                
                if (response.status === 429) {
                    console.log(`Rate limited, waiting before retry. ${retries - 1} retries left`);
                    retries--;
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    continue;
                }
                
                if (!response.ok) {
                    throw new Error(`AI API: ${response.status}`);
                }
                
                const reader = response.body.getReader();
                let chunkSummary = '';
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const text = new TextDecoder().decode(value);
                    const lines = text.split('\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.choices && data.choices[0].delta.content) {
                                    chunkSummary += data.choices[0].delta.content;
                                }
                            } catch (e) {
                                if (!line.includes('[DONE]')) {
                                    console.warn('Error parsing SSE message:', e);
                                }
                            }
                        }
                    }
                }
                
                fullSummary += chunkSummary + '\n';
                await chrome.runtime.sendMessage({ 
                    action: "updateUI",
                    partial: fullSummary
                }).catch(() => {});
                
                break;
                
            } catch (error) {
                console.error(`Error processing chunk ${i + 1}/${chunks.length}:`, error);
                retries--;
                if (retries === 0) throw error;
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
    
    return fullSummary;
}

async function fetchAICompletion(transcript) {
    console.log('Making request to AI API...');
    
    const settings = await chrome.storage.local.get(['apiKey', 'modelName', 'baseUrl']);
    const modelName = settings.modelName || 'gpt-4-turbo-preview';
    const baseUrl = settings.baseUrl || 'https://api.openai.com/v1';
    
    console.log('Using model:', modelName);

    try {
        const summary = await processChunks(
            transcript, 
            modelName, 
            settings.apiKey, 
            baseUrl
        );
        
        if (!summary) {
            throw new Error("No content received from AI");
        }
        
        return summary;
    } catch (error) {
        console.error('Error in fetchAICompletion:', error);
        throw error;
    }
}
