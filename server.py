from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import tempfile
from waitress import serve
import re
import shlex
import logging

app = Flask(__name__)
CORS(app)

def clean_transcript(text):
    # Remove music notes
    text = re.sub(r'♪', '', text)
    
    # Remove parenthetical descriptions like (gentle music)
    text = re.sub(r'\([^)]*\)', '', text)
    
    # Remove extra spaces
    text = re.sub(r' +', ' ', text)
    
    return text.strip()

@app.route('/get_transcript', methods=['POST'])
def get_transcript():
    try:
        data = request.json
        url = data['url']
        
        with tempfile.TemporaryDirectory() as tmpdir:
            # Download subtitles
            cmd = [
                'yt-dlp',
                '--no-playlist',
                '--skip-download',
                '--js-runtimes', 'deno',
                '--write-subs',
                '--write-auto-subs',
                '--sub-lang', 'en',
                '--sub-format', 'ttml',
                '--convert-subs', 'srt',
                '--output', f'{tmpdir}/transcript.%(ext)s',
                url
            ]

            print("yt-dlp command:")
            print(shlex.join(cmd))
            subprocess.run(cmd, check=True)


            # Clean and format subtitles
            output_file = f'{tmpdir}/output.txt'
            subprocess.run(f"""
                cat {tmpdir}/transcript.en.srt | 
                sed '/^$/d' | 
                grep -v '^[0-9]*$' | 
                grep -v '\\-->' | 
                sed 's/<[^>]*>//g' | 
                tr '\n' ' ' > {output_file}
            """, shell=True, check=True)

            with open(output_file, 'r') as f:
                raw_text = f.read()
                cleaned_text = clean_transcript(raw_text)

            # Extract video metadata
            channel = ""
            upload_date = ""
            try:
                meta = subprocess.run(
                    ['yt-dlp', '--no-playlist', '--skip-download',
                     '--print', 'channel', '--print', 'upload_date', url],
                    capture_output=True, text=True, check=True
                )
                lines = meta.stdout.strip().split('\n', 1)
                if len(lines) > 0:
                    channel = lines[0].strip()
                if len(lines) > 1:
                    upload_date = lines[1].strip()
            except Exception:
                pass

            return jsonify({'text': cleaned_text, 'channel': channel, 'upload_date': upload_date})

    except subprocess.CalledProcessError as e:
        return jsonify({'error': f'yt-dlp error: {e.stderr}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logging.getLogger('waitress').setLevel(logging.INFO)
    serve(app, host='0.0.0.0', port=5000)
