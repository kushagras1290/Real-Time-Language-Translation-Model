import os
import wave
import requests
import torch
from transformers import WhisperForConditionalGeneration, WhisperProcessor
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
import keyboard
import threading
import sounddevice as sd
import pygame
import numpy as np
import speech_recognition as sr
from scipy import signal
import time
import json

pygame.mixer.init()

whisper_model_name = "openai/whisper-large"
whisper_model = WhisperForConditionalGeneration.from_pretrained(whisper_model_name)
whisper_processor = WhisperProcessor.from_pretrained(whisper_model_name)

# NLLB model for translation
nllb_model_name = "facebook/nllb-200-distilled-600M"
nllb_model = AutoModelForSeq2SeqLM.from_pretrained(nllb_model_name)
nllb_tokenizer = AutoTokenizer.from_pretrained(nllb_model_name)

# MMS TTS Configuration
MMS_API_URL = "https://api-inference.huggingface.co/models/facebook/mms-1b-all"
HUGGINGFACE_API_TOKEN = "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"  
HEADERS = {"Authorization": f"Bearer {HUGGINGFACE_API_TOKEN}"}

def mms_text_to_speech(text, lang, output_filename, max_retries=3, initial_wait=20):
    """
    Convert text to speech using the MMS model via Hugging Face API with retry logic
    """
    retry_count = 0
    wait_time = initial_wait

    while retry_count < max_retries:
        try:
            # Prepare the payload
            payload = {
                "inputs": text,
                "parameters": {
                    "language": lang
                }
            }
            
            # Make the API request
            response = requests.post(MMS_API_URL, headers=HEADERS, json=payload)
            
            if response.status_code == 200:
                # Success - save the audio content
                with open(output_filename, "wb") as f:
                    f.write(response.content)
                return True
                
            elif response.status_code == 503:
                # Model is loading
                try:
                    error_data = response.json()
                    estimated_time = error_data.get("estimated_time", wait_time)
                    print(f"\nModel is loading. Waiting {estimated_time:.1f} seconds...")
                    time.sleep(estimated_time)
                except (json.JSONDecodeError, KeyError):
                    print(f"\nModel is loading. Waiting {wait_time} seconds...")
                    time.sleep(wait_time)
                    wait_time *= 1.5  # Increase wait time for next retry
                
                retry_count += 1
                if retry_count < max_retries:
                    print(f"Retrying... (Attempt {retry_count + 1} of {max_retries})")
                continue
                
            else:
                print(f"\nAPI request failed with status code {response.status_code}")
                print(f"Error message: {response.text}")
                return False
                
        except Exception as e:
            print(f"\nError in text-to-speech conversion: {e}")
            return False
    
    print("\nMax retries reached. Could not generate speech.")
    return False

def text_to_speech_or_file(text, lang, filename):
    """
    Modified function to use MMS instead of gTTS
    """
    print("\nGenerating speech...")
    success = mms_text_to_speech(text, lang, filename)
    if not success:
        print(f"Text-to-speech failed for language {lang}. Saving text to file instead.")
        text_filename = f"translation_{lang}.txt"
        with open(text_filename, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f"Translation saved to {text_filename}")
    return success


nllb_lang_map = {
    'ace': 'ace_Arab', 'acm': 'acm_Arab', 'acq': 'acq_Arab', 'aeb': 'aeb_Arab', 'af': 'afr_Latn',
    'ajp': 'ajp_Arab', 'ak': 'aka_Latn', 'am': 'amh_Ethi', 'apc': 'apc_Arab', 'ar': 'arb_Arab',
    'ars': 'ars_Arab', 'ary': 'ary_Arab', 'arz': 'arz_Arab', 'as': 'asm_Beng', 'ast': 'ast_Latn',
    'awa': 'awa_Deva', 'ayr': 'ayr_Latn', 'azb': 'azb_Arab', 'azj': 'azj_Latn', 'ba': 'bak_Cyrl',
    'bm': 'bam_Latn', 'ban': 'ban_Latn', 'be': 'bel_Cyrl', 'bem': 'bem_Latn', 'bn': 'ben_Beng',
    'bho': 'bho_Deva', 'bjn': 'bjn_Arab', 'bo': 'bod_Tibt', 'bs': 'bos_Latn', 'bug': 'bug_Latn',
    'bg': 'bul_Cyrl', 'ca': 'cat_Latn', 'ceb': 'ceb_Latn', 'cs': 'ces_Latn', 'cjk': 'cjk_Latn',
    'ckb': 'ckb_Arab', 'crh': 'crh_Latn', 'cy': 'cym_Latn', 'da': 'dan_Latn', 'de': 'deu_Latn',
    'dik': 'dik_Latn', 'dyu': 'dyu_Latn', 'dz': 'dzo_Tibt', 'el': 'ell_Grek', 'en': 'eng_Latn',
    'eo': 'epo_Latn', 'et': 'est_Latn', 'eu': 'eus_Latn', 'ee': 'ewe_Latn', 'fo': 'fao_Latn',
    'fj': 'fij_Latn', 'fi': 'fin_Latn', 'fon': 'fon_Latn', 'fr': 'fra_Latn', 'fur': 'fur_Latn',
    'fuv': 'fuv_Latn', 'gaz': 'gaz_Latn', 'gd': 'gla_Latn', 'ga': 'gle_Latn', 'gl': 'glg_Latn',
    'gn': 'grn_Latn', 'gu': 'guj_Gujr', 'ht': 'hat_Latn', 'ha': 'hau_Latn', 'he': 'heb_Hebr',
    'hi': 'hin_Deva', 'hne': 'hne_Deva', 'hr': 'hrv_Latn', 'hu': 'hun_Latn', 'hy': 'hye_Armn',
    'ig': 'ibo_Latn', 'ilo': 'ilo_Latn', 'id': 'ind_Latn', 'is': 'isl_Latn', 'it': 'ita_Latn',
    'jv': 'jav_Latn', 'ja': 'jpn_Jpan', 'kab': 'kab_Latn', 'kac': 'kac_Latn', 'kam': 'kam_Latn',
    'kn': 'kan_Knda', 'ks': 'kas_Arab', 'ka': 'kat_Geor', 'kk': 'kaz_Cyrl', 'kbp': 'kbp_Latn',
    'kea': 'kea_Latn', 'km': 'khm_Khmr', 'ki': 'kik_Latn', 'rw': 'kin_Latn', 'ky': 'kir_Cyrl',
    'kmb': 'kmb_Latn', 'kg': 'kon_Latn', 'ko': 'kor_Hang', 'lo': 'lao_Laoo', 'lv': 'lvs_Latn',
    'lij': 'lij_Latn', 'li': 'lim_Latn', 'ln': 'lin_Latn', 'lt': 'lit_Latn', 'lmo': 'lmo_Latn',
    'ltg': 'ltg_Latn', 'lb': 'ltz_Latn', 'lua': 'lua_Latn', 'lg': 'lug_Latn', 'luo': 'luo_Latn',
    'lus': 'lus_Latn', 'mag': 'mag_Deva', 'mai': 'mai_Deva', 'ml': 'mal_Mlym', 'mr': 'mar_Deva',
    'min': 'min_Latn', 'mk': 'mkd_Cyrl', 'plt': 'plt_Latn', 'mt': 'mlt_Latn', 'mni': 'mni_Beng',
    'khk': 'khk_Cyrl', 'mos': 'mos_Latn', 'mi': 'mri_Latn', 'my': 'mya_Mymr', 'nl': 'nld_Latn',
    'nn': 'nno_Latn', 'nb': 'nob_Latn', 'npi': 'npi_Deva', 'nso': 'nso_Latn', 'nus': 'nus_Latn',
    'ny': 'nya_Latn', 'oc': 'oci_Latn', 'gaz': 'gaz_Latn', 'or': 'ory_Orya', 'pag': 'pag_Latn',
    'pa': 'pan_Guru', 'pap': 'pap_Latn', 'pl': 'pol_Latn', 'pt': 'por_Latn', 'prs': 'prs_Arab',
    'pbt': 'pbt_Arab', 'quy': 'quy_Latn', 'ro': 'ron_Latn', 'rn': 'run_Latn', 'ru': 'rus_Cyrl',
    'sg': 'sag_Latn', 'sa': 'san_Deva', 'sat': 'sat_Beng', 'scn': 'scn_Latn', 'shn': 'shn_Mymr',
    'si': 'sin_Sinh', 'sk': 'slk_Latn', 'sl': 'slv_Latn', 'sm': 'smo_Latn', 'sn': 'sna_Latn',
    'sd': 'snd_Arab', 'so': 'som_Latn', 'st': 'sot_Latn', 'es': 'spa_Latn', 'als': 'als_Latn',
    'sc': 'srd_Latn', 'sr': 'srp_Cyrl', 'ss': 'ssw_Latn', 'su': 'sun_Latn', 'sv': 'swe_Latn',
    'sw': 'swh_Latn', 'szl': 'szl_Latn', 'ta': 'tam_Taml', 'tt': 'tat_Cyrl', 'te': 'tel_Telu',
    'tg': 'tgk_Cyrl', 'tl': 'tgl_Latn', 'th': 'tha_Thai', 'ti': 'tir_Ethi', 'tpi': 'tpi_Latn',
    'tn': 'tsn_Latn', 'ts': 'tso_Latn', 'tk': 'tuk_Latn', 'tum': 'tum_Latn', 'tr': 'tur_Latn',
    'tw': 'twi_Latn', 'tzm': 'tzm_Tfng', 'ug': 'uig_Arab', 'uk': 'ukr_Cyrl', 'umb': 'umb_Latn',
    'ur': 'urd_Arab', 'uz': 'uzn_Latn', 'vec': 'vec_Latn', 'vi': 'vie_Latn', 'war': 'war_Latn',
    'wo': 'wol_Latn', 'xh': 'xho_Latn', 'ydd': 'ydd_Hebr', 'yo': 'yor_Latn', 'yue': 'yue_Hant',
    'zh': 'zho_Hans', 'zsm': 'zsm_Latn', 'zu': 'zul_Latn'
}
"""
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
"""
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
        translation = nllb_tokenizer.batch_decode(translated, skip_special_tokens=True)[0]
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
        output_audio = "output_audio.wav"  # Changed to .wav as MMS might output in wav format
        tts_success = text_to_speech_or_file(translation, target_lang, output_audio)
        if tts_success:
            print("Playing translated audio...")
            play_audio(output_audio)
        else:
            print("Audio playback not available. Translation saved to text file.")
    else:
        print("Translation failed or returned the original text. Saving original text to file.")
        text_filename = f"original_text_{source_lang}.txt"
        with open(text_filename, 'w', encoding='utf-8') as f:
            f.write(text_to_translate)
        print(f"Original text saved to {text_filename}")

    print("\nProcess completed. Thank you for using the translation service!")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nProgram interrupted by user. Exiting...")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        print("Please try running the program again.")