import os
import wave
import requests
import torch
from transformers import WhisperForConditionalGeneration, WhisperProcessor #,WhisperTokenizer
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from gtts import gTTS
from io import BytesIO
import keyboard
import threading
import sounddevice as sd
import pygame
import numpy as np
import speech_recognition as sr
from scipy import signal
#import librosa

pygame.mixer.init()

whisper_model_name = "openai/whisper-large"
whisper_model = WhisperForConditionalGeneration.from_pretrained(whisper_model_name)
whisper_processor = WhisperProcessor.from_pretrained(whisper_model_name)

# NLLB model for translation
nllb_model_name = "facebook/nllb-200-distilled-600M"
nllb_model = AutoModelForSeq2SeqLM.from_pretrained(nllb_model_name)
nllb_tokenizer = AutoTokenizer.from_pretrained(nllb_model_name)


nllb_lang_map = {
    'ace': 'Acehnese', 'acm': 'Mesopotamian Arabic', 'acq': 'Taizzi-Adeni Arabic', 'aeb': 'Tunisian Arabic', 'af': 'Afrikaans',
    'ajp': 'South Levantine Arabic', 'ak': 'Akan', 'als': 'Tosk Albanian', 'am': 'Amharic', 'apc': 'North Levantine Arabic',
    'ar': 'Arabic', 'ars': 'Najdi Arabic', 'ary': 'Moroccan Arabic', 'arz': 'Egyptian Arabic', 'as': 'Assamese',
    'ast': 'Asturian', 'awa': 'Awadhi', 'ayr': 'Aymara', 'azb': 'South Azerbaijani', 'azj': 'North Azerbaijani',
    'ba': 'Bashkir', 'bm': 'Bambara', 'ban': 'Balinese', 'be': 'Belarusian', 'bem': 'Bemba', 'bn': 'Bengali',
    'bho': 'Bhojpuri', 'bjn': 'Banjar', 'bo': 'Tibetan', 'bs': 'Bosnian', 'bug': 'Buginese', 'bg': 'Bulgarian',
    'ca': 'Catalan', 'ceb': 'Cebuano', 'cs': 'Czech', 'cjk': 'Chokwe', 'ckb': 'Sorani Kurdish', 'crh': 'Crimean Tatar',
    'cy': 'Welsh', 'da': 'Danish', 'de': 'German', 'dik': 'Dinka', 'dyu': 'Dyula', 'dz': 'Dzongkha',
    'el': 'Greek', 'en': 'English', 'eo': 'Esperanto', 'et': 'Estonian', 'eu': 'Basque', 'ee': 'Ewe',
    'fo': 'Faroese', 'fj': 'Fijian', 'fi': 'Finnish', 'fon': 'Fon', 'fr': 'French', 'fur': 'Friulian',
    'fuv': 'Nigerian Fulfulde', 'gaz': 'Oromo', 'gd': 'Scottish Gaelic', 'ga': 'Irish', 'gl': 'Galician',
    'gn': 'Guarani', 'gu': 'Gujarati', 'ht': 'Haitian Creole', 'ha': 'Hausa', 'he': 'Hebrew', 'hi': 'Hindi',
    'hne': 'Chhattisgarhi', 'hr': 'Croatian', 'hu': 'Hungarian', 'hy': 'Armenian', 'ig': 'Igbo', 'ilo': 'Ilocano',
    'id': 'Indonesian', 'is': 'Icelandic', 'it': 'Italian', 'jv': 'Javanese', 'ja': 'Japanese', 'kab': 'Kabyle',
    'kac': 'Kachin', 'kam': 'Kamba', 'kn': 'Kannada', 'ks': 'Kashmiri', 'ka': 'Georgian', 'kk': 'Kazakh',
    'kbp': 'Kabiye', 'kea': 'Cape Verdean Creole', 'khk': 'Halh Mongolian', 'km': 'Khmer', 'ki': 'Kikuyu',
    'rw': 'Kinyarwanda', 'ky': 'Kyrgyz', 'kmb': 'Kimbundu', 'kg': 'Kongo', 'ko': 'Korean', 'lo': 'Lao',
    'lv': 'Latvian', 'lij': 'Ligurian', 'li': 'Limburgish', 'ln': 'Lingala', 'lt': 'Lithuanian', 'lmo': 'Lombard',
    'ltg': 'Latgalian', 'lb': 'Luxembourgish', 'lua': 'Luba-Kasai', 'lg': 'Ganda', 'luo': 'Luo', 'lus': 'Mizo',
    'mag': 'Magahi', 'mai': 'Maithili', 'ml': 'Malayalam', 'mr': 'Marathi', 'min': 'Minangkabau', 'mk': 'Macedonian',
    'plt': 'Plateau Malagasy', 'mt': 'Maltese', 'mni': 'Manipuri', 'mos': 'Mossi', 'mi': 'Maori', 'my': 'Burmese',
    'nl': 'Dutch', 'nn': 'Norwegian Nynorsk', 'nb': 'Norwegian Bokmål', 'npi': 'Nepali', 'nso': 'Northern Sotho',
    'nus': 'Nuer', 'ny': 'Nyanja', 'oc': 'Occitan', 'ory': 'Odia', 'pag': 'Pangasinan', 'pa': 'Punjabi',
    'pap': 'Papiamento', 'pl': 'Polish', 'pt': 'Portuguese', 'prs': 'Dari', 'pbt': 'Pashto', 'pes': 'Iranian Persian',
    'quy': 'Quechua', 'ro': 'Romanian', 'rn': 'Rundi', 'ru': 'Russian', 'sg': 'Sango', 'sa': 'Sanskrit',
    'sat': 'Santali', 'scn': 'Sicilian', 'shn': 'Shan', 'si': 'Sinhala', 'sk': 'Slovak', 'sl': 'Slovenian',
    'sm': 'Samoan', 'sn': 'Shona', 'sd': 'Sindhi', 'so': 'Somali', 'st': 'Southern Sotho', 'es': 'Spanish',
    'sc': 'Sardinian', 'sr': 'Serbian', 'ss': 'Swati', 'su': 'Sundanese', 'sv': 'Swedish', 'sw': 'Swahili',
    'szl': 'Silesian', 'ta': 'Tamil', 'taq': 'Tamasheq', 'tt': 'Tatar', 'te': 'Telugu', 'tg': 'Tajik',
    'tl': 'Tagalog', 'th': 'Thai', 'ti': 'Tigrinya', 'tpi': 'Tok Pisin', 'tn': 'Tswana', 'ts': 'Tsonga',
    'tk': 'Turkmen', 'tum': 'Tumbuka', 'tr': 'Turkish', 'tw': 'Twi', 'tzm': 'Central Atlas Tamazight',
    'ug': 'Uyghur', 'uk': 'Ukrainian', 'umb': 'Umbundu', 'ur': 'Urdu', 'uzn': 'Northern Uzbek', 'vec': 'Venetian',
    'vi': 'Vietnamese', 'war': 'Waray', 'wo': 'Wolof', 'xh': 'Xhosa', 'ydd': 'Eastern Yiddish', 'yo': 'Yoruba',
    'yue': 'Cantonese', 'zh': 'Chinese', 'zsm': 'Standard Malay', 'zu': 'Zulu'
}

def preprocess_audio(audio, sample_rate):
    # Apply a high-pass filter to remove low frequency noise
    sos = signal.butter(10, 100, 'hp', fs=sample_rate, output='sos')
    filtered_audio = signal.sosfilt(sos, audio)
    
    # Normalize audio
    normalized_audio = np.int16(filtered_audio / np.max(np.abs(filtered_audio)) * 32767)
    return normalized_audio

def transcribe_audio_whisper(filename, source_lang):
    with wave.open(filename, 'rb') as wav_file:
        audio = np.frombuffer(wav_file.readframes(wav_file.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        sampling_rate = wav_file.getframerate()

    # Preprocess audio
    preprocessed_audio = preprocess_audio(audio, sampling_rate)
    
    input_features = whisper_processor(preprocessed_audio, sampling_rate=sampling_rate, return_tensors="pt").input_features
    
    # Create an attention mask
    attention_mask = torch.ones_like(input_features)
    
    # Generate without forced_decoder_ids
    with torch.no_grad():
        predicted_ids = whisper_model.generate(
            input_features,
            attention_mask=attention_mask,
            language=source_lang,
            task="transcribe"
        )
    
    transcription = whisper_processor.batch_decode(predicted_ids, skip_special_tokens=True,clean_up_tokenization_spaces=False)[0]
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
    if len(whisper_transcription.split()) < 3:  # If Whisper output is too short, try SpeechRecognition
        print("Whisper transcription was too short. Trying SpeechRecognition...")
        return transcribe_audio_speechrecognition(filename, source_lang)
    return whisper_transcription

def translate_text(text, source_lang, target_lang):
    if source_lang == target_lang:
        return text  # No translation needed

    source_lang_nllb = nllb_lang_map.get(source_lang, source_lang)
    target_lang_nllb = nllb_lang_map.get(target_lang, target_lang)

    try:
        # Tokenize the input text
        inputs = nllb_tokenizer(text, return_tensors="pt")

        # Generate translation
        translated = nllb_model.generate(
            **inputs,
            forced_bos_token_id=nllb_tokenizer.convert_tokens_to_ids(target_lang_nllb),
            max_length=128
        )

        # Decode the generated tokens
        translation = nllb_tokenizer.batch_decode(translated, skip_special_tokens=True, clean_up_tokenization_spaces=False)[0]
        return translation
    except Exception as e:
        print(f"Translation error: {e}")
        print(f"Source language: {source_lang}, Target language: {target_lang}")
        print(f"NLLB source language: {source_lang_nllb}, NLLB target language: {target_lang_nllb}")
        return text  

def transcribe_audio(filename, source_lang):
    with wave.open(filename, 'rb') as wav_file:
        audio = np.frombuffer(wav_file.readframes(wav_file.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        sampling_rate = wav_file.getframerate()

    input_features = whisper_processor(audio, sampling_rate=sampling_rate, return_tensors="pt").input_features

    # Force transcription in the source language
    with torch.no_grad():
        predicted_ids = whisper_model.generate(input_features, language=source_lang)
    
    transcription = whisper_processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]
    return transcription

def record_audio(filename):
    fs = 16000  
    channels = 1  
    recording = []
    recording_flag = threading.Event()
    recording_flag.set()

    def callback(indata, frames, time, status):
        if status:
            print(status)
        if recording_flag.is_set():
            recording.append(indata.copy())

    print("Press Enter to start recording.")
    input()

    print("Recording... Press Enter to stop.")
    with sd.InputStream(samplerate=fs, channels=channels, callback=callback):
        input()
        print("Stopping recording...")
        recording_flag.clear()

    audio_data = np.concatenate(recording, axis=0)
    with wave.open(filename, 'wb') as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(fs)
        wf.writeframes(audio_data.tobytes())

def text_to_speech(text, lang, filename):
    tts = gTTS(text=text, lang=lang)
    tts.save(filename)

def play_audio(filename):
    pygame.mixer.music.load(filename)
    pygame.mixer.music.play()
    while pygame.mixer.music.get_busy():
        pygame.time.Clock().tick(10)

def main():
    print("Available language codes:", ", ".join(sorted(nllb_lang_map.keys())))
    
    while True:
        source_lang = input("Enter the source language code: ").strip().lower()
        if source_lang in nllb_lang_map:
            break
        print("Invalid language code. Please try again.")

    while True:
        input_type = input("Choose input type (audio/text): ").strip().lower()
        if input_type in ['audio', 'text']:
            break
        print("Invalid input type. Please choose 'audio' or 'text'.")

    if input_type == 'audio':
        audio_filename = "audio.wav"
        record_audio(audio_filename)
        print("Transcribing audio...")
        text_to_translate = transcribe_audio(audio_filename, source_lang)
        print(f"Transcription: {text_to_translate}")
        
        confirm = input("Is this transcription correct? (yes/no): ").strip().lower()
        if confirm != 'yes':
            text_to_translate = input("Please enter the correct transcription: ")
    else:
        text_to_translate = input("Enter the text to translate: ")

    while True:
        target_lang = input("Enter the target language code: ").strip().lower()
        if target_lang in nllb_lang_map:
            break
        print("Invalid language code. Please try again.")

    print("Translating...")
    translation = translate_text(text_to_translate, source_lang, target_lang)
    print(f"Translation: {translation}")

    if translation != text_to_translate:
        output_audio = "output_audio.mp3"
        try:
            text_to_speech(translation, target_lang, output_audio)
            print("Playing translated audio...")
            play_audio(output_audio)
        except Exception as e:
            print(f"Error in text-to-speech or audio playback: {e}")
            print("Skipping audio playback.")
    else:
        print("Translation failed or returned the original text. Audio playback skipped.")

    print("\nProcess completed. Thank you for using the translation service!")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nProgram interrupted by user. Exiting...")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        print("Please try running the program again.")