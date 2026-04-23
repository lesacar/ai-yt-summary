- Add prettier font, e.g. Claude'


- Change line height to 2px or something just to make it a bit less compact and more readable


- always provide the "base url" option, grayed out if choosing "openai, anthropic, deepseek"..., but interactible if "custom OAI endpoint" is chosen


- try to detect base-url option, e.g. ```if model.contains(deepseek) then base_url.recommend(api.deepseek.com)```


- NO OAUTH (don't want to bother)


- asdas: might be pointless since most people would use a VPS or centralized server/provider anyways (if this took off)
    transcript server url autofetch by looking at lan devices on port 5000 and checking if they have get_transcript route



- fetch model names from the provider, e.g.: ```https://api.openai.com/v1/models```:
    example output (focus on data.id, should be as many of them as there are models):
    ```{"object":"list","data":[{"id":"deepseek-chat","K":"V","K":"V"},{"id":"deepseek-reasoner","K":"V","K":"V"}]}```


- Dropdown for fetching model, with optional "custom" if a model is not in the API which ungreys another text box for custom model name
