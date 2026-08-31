from bottle import Bottle, request, static_file, response
import os
from file import transcribe_audio, translate_text, text_to_speech_or_file

app = Bottle()

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "output"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

@app.route("/")
def home():
    return "Welcome to the Real-Time Language Translator API"

@app.post("/translate")
def translate():
    source_lang = request.forms.get("source_lang")
    target_lang = request.forms.get("target_lang")
    text = request.forms.get("text", "")

    audio_file = request.files.get("audio")
    if audio_file:
        filepath = os.path.join(UPLOAD_FOLDER, audio_file.filename)
        audio_file.save(filepath)
        text = transcribe_audio(filepath, source_lang)

    if not text:
        response.status = 400
        return {"error": "No text provided for translation."}

    translation = translate_text(text, source_lang, target_lang)

    audio_output_path = os.path.join(OUTPUT_FOLDER, "output_audio.mp3")
    tts_success = False
    if translation != text:
        tts_success = text_to_speech_or_file(translation, target_lang, audio_output_path)

    result = {"translation": translation}
    if tts_success:
        result["audio_url"] = f"/audio/output_audio.mp3"
    else:
        result["audio_url"] = None

    return result

@app.route("/audio/<filename>")
def serve_audio(filename):
    filepath = os.path.join(OUTPUT_FOLDER, filename)
    if os.path.exists(filepath):
        return static_file(filename, root=OUTPUT_FOLDER)
    response.status = 404
    return {"error": "Audio file not found"}

# Run the app
# app.run(host="localhost", port=8080)
