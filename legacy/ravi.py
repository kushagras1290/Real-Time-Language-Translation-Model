import os
import wave
import torch
import numpy as np
import sounddevice as sd
from flask import Flask, render_template, request, jsonify, send_file
from transformers import WhisperForConditionalGeneration, WhisperProcessor
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from gtts import gTTS
import speech_recognition as sr
from scipy import signal

app = Flask(__name__)

# Global variables for models and processors
whisper_model = None
whisper_processor = None
nllb_model = None
nllb_tokenizer = None

# Language mapping
nllb_lang_map = {
    'en': 'eng_Latn', 'es': 'spa_Latn', 'fr': 'fra_Latn', 'de': 'deu_Latn',  # Example subset of language codes
    'hi': 'hin_Deva', 'zh': 'zho_Hans', 'ar': 'arb_Arab', 'ru': 'rus_Cyrl'
}

def preprocess_audio(audio, sample_rate):
    sos = signal.butter(10, 100, 'hp', fs=sample_rate, output='sos')
    filtered_audio = signal.sosfilt(sos, audio)
    normalized_audio = np.int16(filtered_audio / np.max(np.abs(filtered_audio)) * 32767)
    return normalized_audio

def transcribe_audio_whisper(filename, source_lang):
    with wave.open(filename, 'rb') as wav_file:
        audio = np.frombuffer(wav_file.readframes(wav_file.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        sampling_rate = wav_file.getframerate()

    preprocessed_audio = preprocess_audio(audio, sampling_rate)
    input_features = whisper_processor(preprocessed_audio, sampling_rate=sampling_rate, return_tensors="pt").input_features
    attention_mask = torch.ones_like(input_features)
    
    with torch.no_grad():
        predicted_ids = whisper_model.generate(
            input_features,
            attention_mask=attention_mask,
            language=source_lang,
            task="transcribe"
        )
    
    transcription = whisper_processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]
    return transcription

def transcribe_audio_speechrecognition(filename, source_lang):
    recognizer = sr.Recognizer()
    with sr.AudioFile(filename) as source:
        audio = recognizer.record(source)
    try:
        return recognizer.recognize_google(audio, language=source_lang)
    except sr.UnknownValueError:
        return "Speech Recognition could not understand audio"
    except sr.RequestError as e:
        return f"Could not request results from Speech Recognition service; {e}"

def transcribe_audio(filename, source_lang):
    whisper_transcription = transcribe_audio_whisper(filename, source_lang)
    if len(whisper_transcription.split()) < 3:
        print("Whisper transcription was too short. Trying SpeechRecognition...")
        return transcribe_audio_speechrecognition(filename, source_lang)
    return whisper_transcription

def translate_text(text, source_lang, target_lang):
    if source_lang == target_lang:
        return text

    source_lang_nllb = nllb_lang_map.get(source_lang, source_lang)
    target_lang_nllb = nllb_lang_map.get(target_lang, target_lang)

    try:
        inputs = nllb_tokenizer(text, return_tensors="pt")
        translated = nllb_model.generate(
            **inputs,
            forced_bos_token_id=nllb_tokenizer.convert_tokens_to_ids(target_lang_nllb),
            max_length=128
        )
        translation = nllb_tokenizer.batch_decode(translated, skip_special_tokens=True)[0]
        return translation
    except Exception as e:
        print(f"Translation error: {e}")
        return text

def text_to_speech(text, lang, filename):
    tts = gTTS(text=text, lang=lang)
    tts.save(filename)

@app.before_first_request
def load_models():
    global whisper_model, whisper_processor, nllb_model, nllb_tokenizer
    try:
        print("Loading models...")
        whisper_model_name = "openai/whisper-large"
        nllb_model_name = "facebook/nllb-200-distilled-600M"
        whisper_model = WhisperForConditionalGeneration.from_pretrained(whisper_model_name)
        whisper_processor = WhisperProcessor.from_pretrained(whisper_model_name)
        nllb_model = AutoModelForSeq2SeqLM.from_pretrained(nllb_model_name)
        nllb_tokenizer = AutoTokenizer.from_pretrained(nllb_model_name)
        print("Models loaded successfully.")
    except Exception as e:
        print(f"Error loading models: {e}")
        exit(1)

@app.route('/')
def index():
    languages = sorted(nllb_lang_map.keys())
    return render_template('index1.html', languages=languages) 

@app.route('/record_audio', methods=['POST'])
def record_audio():
    return jsonify({'status': 'success', 'message': 'Audio recorded'})

@app.route('/transcribe', methods=['POST'])
def transcribe():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400
    
    audio_file = request.files['audio']
    source_lang = request.form.get('source_lang', 'en')
    
    if audio_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if audio_file:
        filename = 'temp_audio.wav'
        audio_file.save(filename)
        transcription = transcribe_audio(filename, source_lang)
        os.remove(filename)
        return jsonify({'transcription': transcription})

@app.route('/translate', methods=['POST'])
def translate():
    text = request.form.get('text')
    source_lang = request.form.get('source_lang')
    target_lang = request.form.get('target_lang')
    
    if not all([text, source_lang, target_lang]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    translation = translate_text(text, source_lang, target_lang)
    return jsonify({'translation': translation})

@app.route('/text_to_speech', methods=['POST'])
def generate_speech():
    text = request.form.get('text')
    lang = request.form.get('lang')
    
    if not all([text, lang]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    filename = 'temp_speech.mp3'
    text_to_speech(text, lang, filename)
    
    return send_file(filename, as_attachment=True, download_name='translation.mp3')

if __name__ == '__main__':
    try:
        app.run(debug=True)
    except Exception as e:
        print(f"An error occurred: {e}")
