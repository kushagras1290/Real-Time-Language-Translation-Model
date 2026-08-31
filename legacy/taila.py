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

# Model configurations
whisper_model_name = "openai/whisper-large"
whisper_model = WhisperForConditionalGeneration.from_pretrained(whisper_model_name)
whisper_processor = WhisperProcessor.from_pretrained(whisper_model_name)

nllb_model_name = "facebook/nllb-200-distilled-600M"
nllb_model = AutoModelForSeq2SeqLM.from_pretrained(nllb_model_name)
nllb_tokenizer = AutoTokenizer.from_pretrained(nllb_model_name)

# MMS TTS Configuration
MMS_API_URL = "https://api-inference.huggingface.co/models/facebook/mms-1b-all"
HUGGINGFACE_API_TOKEN = "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"
HEADERS = {"Authorization": f"Bearer {HUGGINGFACE_API_TOKEN}"}

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

def mms_text_to_speech(text, lang, output_filename, max_retries=3, initial_wait=20):
    lang_short = lang.split('_')[0]  # Use only the main language code (e.g., 'awa')
    retry_count = 0
    wait_time = initial_wait

    while retry_count < max_retries:
        try:
            payload = {
                "inputs": text,
                "parameters": {
                    "language": lang_short,
                }
            }

            response = requests.post(MMS_API_URL, headers=HEADERS, json=payload)

            if response.status_code == 200:
                content_type = response.headers.get('Content-Type')
                if content_type == 'audio/mpeg':
                    output_filename += ".mp3"
                elif content_type == 'audio/wav':
                    output_filename += ".wav"
                else:
                    print("Unsupported audio format.")
                    return False

                with open(output_filename, "wb") as f:
                    f.write(response.content)
                print(f"Audio saved to {output_filename}")
                return True

            elif response.status_code == 503:
                print("API model is loading. Retrying...")
                time.sleep(wait_time)
                wait_time *= 1.5
                retry_count += 1
            else:
                print(f"API Error {response.status_code}: {response.text}")
                return False

        except Exception as e:
            print(f"Error in API request: {e}")
            return False

    print("Max retries reached. Speech generation failed.")
    return False

def text_to_speech_or_file(text, lang, filename):
    print("\nGenerating speech...")
    success = mms_text_to_speech(text, lang, filename)
    if not success:
        print(f"Text-to-speech failed for language {lang}. Saving text to file instead.")
        text_filename = f"translation_{lang}.txt"
        with open(text_filename, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f"Translation saved to {text_filename}")
    return success

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

def play_audio(filename):
    pygame.mixer.music.load(filename)
    pygame.mixer.music.play()
    while pygame.mixer.music.get_busy():
        pygame.time.Clock().tick(10)

def main():
    print("Available language codes:", ", ".join(sorted(nllb_lang_map.keys())))

    source_lang = input("Enter the source language code: ").strip().lower()
    input_type = input("Choose input type (audio/text): ").strip().lower()

    if input_type == 'text':
        text_to_translate = input("Enter the text to translate: ")
    else:
        print("Audio input not supported in this version.")
        return

    target_lang = input("Enter the target language code: ").strip().lower()
    print("Translating...")
    translation = translate_text(text_to_translate, source_lang, target_lang)
    print(f"Translation: {translation}")

    # Save translation to a file
    translated_text_file = "translated_text.txt"
    with open(translated_text_file, 'w', encoding='utf-8') as file:
        file.write(translation)
    print(f"Translation saved to {translated_text_file}")

    # Read from file and generate TTS
    with open(translated_text_file, 'r', encoding='utf-8') as file:
        text_for_tts = file.read()

    output_audio = "output_audio"
    target_lang_mms = nllb_lang_map[target_lang].split('_')[0]
    tts_success = text_to_speech_or_file(text_for_tts, target_lang_mms, output_audio)

    if tts_success:
        print("Playing translated audio...")
        play_audio(output_audio)

    print("\nProcess completed. Thank you for using the translation service!")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nProgram interrupted by user. Exiting...")
