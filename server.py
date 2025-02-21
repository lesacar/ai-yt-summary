from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import tempfile
from waitress import serve
import re

app = Flask(__name__)
CORS(app)

def clean_transcript(text):
    # Remove music notes and their Unicode variants
    text = re.sub(r'♪|\u266a', '', text)
    
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
            subprocess.run([
                'yt-dlp',
                '--no-playlist',
                '--skip-download',
                '--write-subs',
                '--write-auto-subs',
                '--sub-lang', 'en',
                '--sub-format', 'ttml',
                '--convert-subs', 'srt',
                '--output', f'{tmpdir}/transcript.%(ext)s',
                url
            ], check=True)

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
                return jsonify({'text': cleaned_text})

    except subprocess.CalledProcessError as e:
        return jsonify({'error': f'yt-dlp error: {e.stderr}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    serve(app, host='0.0.0.0', port=5000)
