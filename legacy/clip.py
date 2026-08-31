from fastapi import FastAPI, UploadFile, Form
from fastapi.responses import FileResponse, JSONResponse
import os
from file import transcribe_audio, translate_text, text_to_speech_or_file

app = FastAPI()

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "output"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

@app.get("/")
def read_root():
    return {"message": "Welcome to the Real-Time Language Translator API"}

@app.post("/translate")
async def translate(
    source_lang: str = Form(...),
    target_lang: str = Form(...),
    text: str = Form(""),
    audio: UploadFile = None,
):
    try:
        if audio:
            file_path = os.path.join(UPLOAD_FOLDER, audio.filename)
            with open(file_path, "wb") as buffer:
                buffer.write(await audio.read())
            text = transcribe_audio(file_path, source_lang)

        if not text:
            return JSONResponse(content={"error": "No text provided for translation."}, status_code=400)

        translation = translate_text(text, source_lang, target_lang)

        audio_output_path = os.path.join(OUTPUT_FOLDER, "output_audio.mp3")
        tts_success = False
        if translation != text:
            tts_success = text_to_speech_or_file(translation, target_lang, audio_output_path)

        response = {"translation": translation}
        if tts_success:
            response["audio_url"] = f"/audio/output_audio.mp3"
        else:
            response["audio_url"] = None

        return response

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/audio/{filename}")
def get_audio(filename: str):
    file_path = os.path.join(OUTPUT_FOLDER, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return JSONResponse(content={"error": "Audio file not found."}, status_code=404)

