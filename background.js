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
    try {
        const response = await fetch('http://localhost:5000/get_transcript', {
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

async function fetchAICompletion(transcript) {
    console.log('Making request to AI API...');
    
    // Get the API provider settings and model name
    const settings = await chrome.storage.local.get(['apiProvider', 'apiKey', 'modelName']);
    const provider = settings.apiProvider || 'ollama';
    const apiKey = settings.apiKey;
    
    const defaultModels = {
        'ollama': 'llama2',
        'anthropic': 'claude-3-sonnet-20240229',
        'openai': 'gpt-4-turbo-preview',
        'groq': 'mixtral-8x7b-32768'
    };
    
    const modelName = settings.modelName || defaultModels[provider];
    console.log('Using model:', modelName);

    const systemPrompt = `Summarize the key points of this video transcript in a clear, factual bullet-point list. Focus on concrete information and main topics. Avoid interpretations or speculations.

Transcript:
${transcript}

Summary (in bullet points):`;

    try {
        let response;
        
        switch (provider) {
            case 'ollama':
                response = await fetch('http://localhost:11434/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: modelName,
                        prompt: systemPrompt,
                        stream: true
                    })
                });
                break;

            case 'anthropic':
                response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [{
                            role: 'user',
                            content: systemPrompt
                        }],
                        stream: true
                    })
                });
                break;

            case 'openai':
                response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [{
                            role: 'system',
                            content: 'You are a direct and objective summarizer. Focus on concrete facts and key points. Avoid interpretations or speculation.'
                        }, {
                            role: 'user',
                            content: systemPrompt
                        }],
                        stream: true
                    })
                });
                break;

            case 'groq':
                const sanitizedModel = modelName.trim();
                console.log("Using sanitized model name:", sanitizedModel);
                
                const MAX_CHUNK_SIZE = 16000;
                const chunks = [];
                for (let i = 0; i < transcript.length; i += MAX_CHUNK_SIZE) {
                    chunks.push(transcript.slice(i, i + MAX_CHUNK_SIZE));
                }
                
                console.log(`Split transcript into ${chunks.length} chunks`);
                
                let fullSummary = '';
                for (let i = 0; i < chunks.length; i++) {
                    const chunk = chunks[i];
                    let retries = 3;
                    
                    while (retries > 0) {
                        try {
                            // Add delay between chunks (2 seconds)
                            if (i > 0) {
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            }
                            
                            response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${apiKey}`
                                },
                                body: JSON.stringify({
                                    model: sanitizedModel,
                                    messages: [{
                                        role: 'system',
                                        content: 'You are a direct and objective summarizer. Focus on concrete facts and key points. Avoid interpretations or speculation.'
                                    }, {
                                        role: 'user',
                                        content: `Summarize this part of the transcript in bullet points:\n\n${chunk}`
                                    }],
                                    stream: true
                                })
                            });
                            
                            if (response.status === 429) {
                                console.log(`Rate limited, waiting before retry. ${retries - 1} retries left`);
                                retries--;
                                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
                                continue;
                            }
                            
                            if (!response.ok) {
                                throw new Error(`AI API: ${response.status}`);
                            }
                            
                            // Process chunk response...
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
                            
                            break; // Success, exit retry loop
                            
                        } catch (error) {
                            console.error(`Error processing chunk ${i + 1}/${chunks.length}:`, error);
                            retries--;
                            if (retries === 0) throw error;
                            await new Promise(resolve => setTimeout(resolve, 5000));
                        }
                    }
                }
                
                return fullSummary;

            default:
                throw new Error('Invalid API provider selected');
        }

        if (!response.ok) {
            throw new Error(`AI API: ${response.status}`);
        }

        const reader = response.body.getReader();
        let summary = '';
        let buffer = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += new TextDecoder().decode(value);
            
            while (buffer.includes('\n')) {
                const newlineIndex = buffer.indexOf('\n');
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);
                
                if (!line || line === '[DONE]') continue;
                
                if (line.startsWith('data: ')) {
                    try {
                        const jsonStr = line.slice(6);
                        if (jsonStr === '[DONE]') continue;
                        
                        const data = JSON.parse(jsonStr);
                        let content = '';
                        
                        if (provider === 'ollama' && data.response) {
                            content = data.response;
                        } else if (provider === 'anthropic' && data.content) {
                            content = data.content[0].text;
                        } else if ((provider === 'openai' || provider === 'groq') && 
                                 data.choices && data.choices[0].delta.content) {
                            content = data.choices[0].delta.content;
                        }
                        
                        if (content) {
                            summary += content;
                            await chrome.runtime.sendMessage({ 
                                action: "updateUI",
                                partial: summary
                            }).catch(() => {});
                        }
                    } catch (e) {
                        if (!line.includes('[DONE]')) {
                            console.warn('Error parsing SSE message:', e);
                        }
                        continue;
                    }
                }
            }
        }
        
        if (!summary) {
            throw new Error("No content received from AI");
        }
        return summary;
    } catch (error) {
        console.error('Error in fetchAICompletion:', error);
        throw error;
    }
}
