document.addEventListener('DOMContentLoaded', () => {
    const apiProvider = document.getElementById('apiProvider');
    const apiKeyGroup = document.getElementById('apiKeyGroup');
    const apiKey = document.getElementById('apiKey');
    const modelName = document.getElementById('modelName');
    const modelHint = document.getElementById('modelHint');
    const saveButton = document.getElementById('save');
    const savedMessage = document.getElementById('savedMessage');

    const providerDefaults = {
        'ollama': {
            defaultModel: 'llama2',
            hint: 'Examples: llama2, llama-3.3-70b-versatile, mistral, mixtral'
        },
        'anthropic': {
            defaultModel: 'claude-3-sonnet-20240229',
            hint: 'Examples: claude-3-sonnet-20240229, claude-3-opus-20240229'
        },
        'openai': {
            defaultModel: 'gpt-4-turbo-preview',
            hint: 'Examples: gpt-4-turbo-preview, gpt-4, gpt-3.5-turbo'
        },
        'groq': {
            defaultModel: 'mixtral-8x7b-32768',
            hint: 'Examples: mixtral-8x7b-32768, llama2-70b-4096'
        }
    };

    // Load saved settings
    chrome.storage.local.get(['apiProvider', 'apiKey', 'modelName'], (result) => {
        if (result.apiProvider) {
            apiProvider.value = result.apiProvider;
            toggleApiKeyField(result.apiProvider);
            updateModelHint(result.apiProvider);
        }
        if (result.apiKey) {
            apiKey.value = result.apiKey;
        }
        if (result.modelName) {
            modelName.value = result.modelName;
        } else {
            // Set default model based on provider
            modelName.value = providerDefaults[apiProvider.value]?.defaultModel || '';
        }
    });

    function toggleApiKeyField(provider) {
        apiKeyGroup.style.display = 
            (provider === 'anthropic' || provider === 'openai' || provider === 'groq') ? 'block' : 'none';
    }

    function updateModelHint(provider) {
        modelHint.textContent = providerDefaults[provider]?.hint || '';
        modelName.placeholder = providerDefaults[provider]?.defaultModel || '';
    }

    apiProvider.addEventListener('change', () => {
        const provider = apiProvider.value;
        toggleApiKeyField(provider);
        updateModelHint(provider);
        modelName.value = providerDefaults[provider]?.defaultModel || '';
    });

    saveButton.addEventListener('click', () => {
        const settings = {
            apiProvider: apiProvider.value,
            apiKey: apiKey.value,
            modelName: modelName.value || providerDefaults[apiProvider.value]?.defaultModel
        };

        chrome.storage.local.set(settings, () => {
            savedMessage.style.display = 'block';
            setTimeout(() => {
                savedMessage.style.display = 'none';
            }, 2000);
        });
    });
}); 