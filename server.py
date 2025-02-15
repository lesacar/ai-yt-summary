from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import tempfile

app = Flask(__name__)
CORS(app)

@app.route('/get_transcript', methods=['POST'])
def get_transcript():
    try:
        data = request.json
        url = data['url']
        
        with tempfile.TemporaryDirectory() as tmpdir:
            # Download subtitles
            subprocess.run([
                'yt-dlp',
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
                return jsonify({'text': f.read()})

    except subprocess.CalledProcessError as e:
        return jsonify({'error': f'yt-dlp error: {e.stderr}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=False)
