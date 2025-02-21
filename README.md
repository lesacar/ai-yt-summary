## ai-yt-summary

### Examples:
![penguinz0 random video summarized](https://github.com/lesacar/ai-yt-summary/blob/main/res/1.png)

![kanye west song summarized](https://github.com/lesacar/ai-yt-summary/blob/main/res/2.png)

**This extension is really useful for news video like Tech Quickie, The Code Report (from Fireship), Asmongold, etc...**

How to run transcript server:
```
uv venv
uv pip install -r requirements.txt
source .venv/bin/activate

python server.py
```

You can clone the extension on a VPS or other servers and host the transcript server there, makes life a bit easier if you don't want a systemd service or whatever. In the extension options you can change the transcript server URL, **must append /get_transcript** to it!

Works with any OpenAI compatible AI provider. If using **ollama** just put the base url to whatever your IP is.\
For **llama.cpp**'s **llama-server** you can put whatever in *model name* because it's ingored as it only loads whatever you specified in your ```llama-server -m MODEL_NAME```
API keys (I think) are **ignored** by ollama and llama.cpp

![groq api example](https://github.com/lesacar/ai-yt-summary/blob/main/res/3.png)


You must download an AI model that fits in your GPU, otherwise disable the ```-ngl``` line. (See where it is by ```rg "-ngl"``` in the root folder of the extension, but beware that using the CPU will be pretty slow.\

*I've found that even Llama3.2-3B works quite well for summarizing, but bigger models might catch more details, haven't tested yet*

This must be kept alive if you want to use the extension, maybe put it in a systemd service
```llama-server -m MODEL_NAME.gguf --port 11434```

Finally, load the chrome extension, by going to ```chrome://extensions```\
toggling on **Developer mode** in the top right\
Click **Load Unpacked** in the top left which should appear after enabling Developer mode\
and load the base folder of the extension.

If all goes well you should have the extension in your extensions popup in chrome,\
while in a youtube tab, click the extension icon and click summarize, it should take a couple of seconds. The result should be saved even if you change tabs or close the popup or reload the page.


*Issues I found*
- No way to clear the output, unless deleting local storage. I think the output is cached per video, so this shouldn't really be a problem."
- When using small models, they will keep on referencing "The transcript"
- When using small models, they will interpret song lyrics that repeat as repetition, instead of realizing it's a chorus or whatever
- *NOTE - on the 2 above points, I didn't actually test if a bigger models doesn't make these mistakes*
- *NOTE - after testing with llama-70B and optimizing the system prompt the above 2 problems went away in most cases but might slip throught once in a while*

