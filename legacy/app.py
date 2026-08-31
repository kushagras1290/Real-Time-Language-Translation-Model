from flask import Flask, render_template, request, jsonify
import os
import wave
import torch
from transformers import WhisperForConditionalGeneration, WhisperProcessor
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from gtts import gTTS
import numpy as np
import speech_recognition as sr
from scipy import signal

app = Flask(__name__)

# Load models and processors
whisper_model_name = "openai/whisper-large"
whisper_model = WhisperForConditionalGeneration.from_pretrained(whisper_model_name)
whisper_processor = WhisperProcessor.from_pretrained(whisper_model_name)

nllb_model_name = "facebook/nllb-200-distilled-600M"
nllb_model = AutoModelForSeq2SeqLM.from_pretrained(nllb_model_name)
nllb_tokenizer = AutoTokenizer.from_pretrained(nllb_model_name)

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

def preprocess_audio(audio, sample_rate):
    sos = signal.butter(10, 100, 'hp', fs=sample_rate, output='sos')
    filtered_audio = signal.sosfilt(sos, audio)
    normalized_audio = np.int16(filtered_audio / np.max(np.abs(filtered_audio)) * 32767)
    return normalized_audio

def transcribe_audio(filename, source_lang):
    with wave.open(filename, 'rb') as wav_file:
        audio = np.frombuffer(wav_file.readframes(wav_file.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        sampling_rate = wav_file.getframerate()

    preprocessed_audio = preprocess_audio(audio, sampling_rate)
    input_features = whisper_processor(preprocessed_audio, sampling_rate=sampling_rate, return_tensors="pt").input_features
    
    with torch.no_grad():
        predicted_ids = whisper_model.generate(input_features, language=source_lang)
    
    transcription = whisper_processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]
    return transcription

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

@app.route('/')
def index():
    return render_template('index.html', languages=sorted(nllb_lang_map.keys()))

@app.route('/translate', methods=['POST'])
def translate():
    source_lang = request.form['source_lang']
    target_lang = request.form['target_lang']
    input_type = request.form['input_type']
    
    if input_type == 'audio':
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        audio_filename = 'temp_audio.wav'
        audio_file.save(audio_filename)
        
        text_to_translate = transcribe_audio(audio_filename, source_lang)
        os.remove(audio_filename)
    else:
        text_to_translate = request.form['text']
    
    translation = translate_text(text_to_translate, source_lang, target_lang)
    
    if translation != text_to_translate:
        output_audio = "static/output_audio.mp3"
        tts = gTTS(text=translation, lang=target_lang)
        tts.save(output_audio)
        audio_url = '/static/output_audio.mp3'
    else:
        audio_url = None
    
    return jsonify({
        'original_text': text_to_translate,
        'translated_text': translation,
        'audio_url': audio_url
    })

if __name__ == '__main__':
    app.run(debug=True)