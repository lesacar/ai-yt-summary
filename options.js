// options.js
document.addEventListener('DOMContentLoaded', () => {
    const apiProvider = document.getElementById('apiProvider');
    const apiKey = document.getElementById('apiKey');
    const baseUrl = document.getElementById('baseUrl');
    const modelName = document.getElementById('modelName');
    const modelHint = document.getElementById('modelHint');
    const reasoning_effort = document.getElementById('reasoning_effort');
    const reasoning_effortHint = document.getElementById('reasoning_effortHint');
    const transcriptServer = document.getElementById('transcriptServer');
    const saveButton = document.getElementById('save');
    const savedMessage = document.getElementById('savedMessage');
    const resetTranscriptServer = document.getElementById('resetTranscriptServer');
    const resetBaseUrl = document.getElementById('resetBaseUrl');

    const DEFAULT_TRANSCRIPT_SERVER = 'http://localhost:5000/get_transcript';
    const DEFAULT_OPENAI_URL = 'https://api.openai.com/v1';

    const providerDefaults = {
        openai: {
            defaultModel: 'gpt-4-turbo-preview',
            model_hint: 'Examples: gpt-4-turbo-preview, gpt-4, gpt-3.5-turbo',
            reasoning_effort_hint: 'Optional. DeepSeek: none, low, high, max. Leave empty to use the provider default.'
        }
    };

    function updateModelHint(provider) {
        const d = providerDefaults[provider];
        modelHint.textContent = d?.model_hint || '';
        reasoning_effortHint.textContent = d?.reasoning_effort_hint || '';
        modelName.placeholder = d?.defaultModel || '';
    }

    // Load saved settings (always initialise the UI, even on first run)
    chrome.storage.local.get(
        ['apiProvider', 'apiKey', 'modelName', 'baseUrl', 'reasoning_effort', 'transcriptServer'],
        (result) => {
            if (result.apiProvider) apiProvider.value = result.apiProvider;
            updateModelHint(apiProvider.value);
            apiKey.value = result.apiKey || '';
            modelName.value = result.modelName || '';
            baseUrl.value = result.baseUrl || DEFAULT_OPENAI_URL;
            reasoning_effort.value = result.reasoning_effort || '';
            transcriptServer.value = result.transcriptServer || DEFAULT_TRANSCRIPT_SERVER;
        }
    );

    apiProvider.addEventListener('change', () => {
        const provider = apiProvider.value;
        updateModelHint(provider);
        modelName.value = providerDefaults[provider]?.defaultModel || '';
        if (provider === 'openai') baseUrl.value = DEFAULT_OPENAI_URL;
    });

    resetTranscriptServer.addEventListener('click', () => {
        transcriptServer.value = DEFAULT_TRANSCRIPT_SERVER;
    });

    resetBaseUrl.addEventListener('click', () => {
        baseUrl.value = DEFAULT_OPENAI_URL;
    });

    saveButton.addEventListener('click', () => {
        const provider = apiProvider.value;
        const settings = {
            apiProvider: provider,
            apiKey: apiKey.value.trim(),
            modelName: modelName.value.trim() || providerDefaults[provider]?.defaultModel || '',
            reasoning_effort: reasoning_effort.value.trim(),
            transcriptServer: transcriptServer.value.trim() || DEFAULT_TRANSCRIPT_SERVER,
            // strip trailing slashes so `${baseUrl}/chat/completions` is always correct
            baseUrl: (baseUrl.value.trim() || DEFAULT_OPENAI_URL).replace(/\/+$/, '')
        };

        chrome.storage.local.set(settings, () => {
            baseUrl.value = settings.baseUrl;
            savedMessage.style.display = 'block';
            setTimeout(() => { savedMessage.style.display = 'none'; }, 2000);
        });
    });
});
