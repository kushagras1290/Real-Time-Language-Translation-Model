import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { useTheme } from 'next-themes';
import axios from 'axios';
import {
  Sun, Moon, Mic, StopCircle, Play, RefreshCw, Globe, Copy, Check
} from 'lucide-react';
import { Button } from './Button';
import { Alert, AlertDescription } from './Alert';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from './Select';
import { Textarea } from './Textarea';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const API_URL = 'http://localhost:5000/api';

const TranslationApp = () => {
  const [languages, setLanguages] = useState([]);
  const [sourceLang, setSourceLang] = useState('');
  const [targetLang, setTargetLang] = useState('');
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [recentTranslations, setRecentTranslations] = useState([]);
  const [copied, setCopied] = useState(false);

  const { theme, setTheme } = useTheme();
  const audioRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const controls = useAnimation();

  useEffect(() => {
    fetchLanguages();
    const interval = setInterval(() => {
      setProgress((prevProgress) => (prevProgress >= 100 ? 0 : prevProgress + 10));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const fetchLanguages = async () => {
    try {
      const response = await axios.get(`${API_URL}/languages`);
      setLanguages(response.data);
      setSourceLang(response.data[0]);
      setTargetLang(response.data[1]);
    } catch (error) {
      console.error('Error fetching languages:', error);
      toast.error("Failed to fetch languages. Please try again.");
    }
  };

  const handleTranslate = async () => {
    setIsLoading(true);
    controls.start({
      scale: [1, 1.05, 1],
      transition: { duration: 0.3 }
    });
    try {
      const response = await axios.post(`${API_URL}/translate`, {
        text: inputText,
        source_lang: sourceLang,
        target_lang: targetLang,
      });
      setTranslatedText(response.data.translation);
      setRecentTranslations(prev => [
        { from: sourceLang, to: targetLang, text: inputText, translation: response.data.translation },
        ...prev.slice(0, 4)
      ]);
    } catch (error) {
      console.error('Error translating text:', error);
      toast.error("Translation failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecord = async () => {
    if (isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else {
      chunksRef.current = [];
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);

        mediaRecorderRef.current.ondataavailable = (e) => {
          chunksRef.current.push(e.data);
        };

        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/wav' });
          const formData = new FormData();
          formData.append('audio', audioBlob);
          formData.append('source_lang', sourceLang);

          try {
            setIsLoading(true);
            const response = await axios.post(`${API_URL}/transcribe`, formData);
            setInputText(response.data.transcription);
          } catch (error) {
            console.error('Error transcribing audio:', error);
            toast.error("Audio transcription failed. Please try again.");
          } finally {
            setIsLoading(false);
          }
        };

        mediaRecorderRef.current.start();
        setIsRecording(true);
      } catch (error) {
        console.error('Error accessing microphone:', error);
        toast.error("Unable to access microphone. Please check your permissions.");
      }
    }
  };

  const handleTextToSpeech = async () => {
    try {
      setIsLoading(true);
      const response = await axios.post(
        `${API_URL}/text-to-speech`,
        {
          text: translatedText,
          lang: targetLang,
        },
        { responseType: 'blob' }
      );
      const audioBlob = new Blob([response.data], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(audioBlob);
      setAudioUrl(audioUrl);
    } catch (error) {
      console.error('Error generating speech:', error);
      toast.error("Text-to-speech conversion failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSwapLanguages = () => {
    controls.start({
      rotate: 360,
      transition: { duration: 0.5 }
    });
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setInputText(translatedText);
    setTranslatedText(inputText);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative">
      <Head>
        <title>LinguaVerse - Immersive AI Translation Experience</title>
        <meta name="description" content="Dive into a new dimension of language with our cutting-edge AI-powered translation platform." />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* Background and overlay */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[url('/nebula-bg.jpg')] bg-cover bg-center opacity-30 animate-pulse"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/50 via-indigo-900/50 to-blue-900/50"></div>
        <div className="absolute top-0 right-0 h-full w-1/2 bg-gradient-to-br from-blue-600/20 to-black/30 opacity-20"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 bg-black/20 backdrop-blur-lg shadow-lg py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <motion.div
            whileHover={{ rotate: 360, scale: 1.2 }}
            transition={{ duration: 0.5 }}
          >
            <Globe className="h-10 w-10 text-blue-400 drop-shadow-lg" />
          </motion.div>
          <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 drop-shadow-md">
            LinguaVerse
          </span>
          <Button
            variant="outline"
            className="hover:bg-blue-900 transition-all"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="w-6 h-6 text-yellow-500" /> : <Moon className="w-6 h-6 text-gray-400" />}
          </Button>
        </div>
      </nav>

      {/* Main content */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="space-y-8 max-w-4xl"
        >
          <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500">
            Welcome to LinguaVerse
          </h1>

          {/* Translation Card */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 bg-black/50 p-8 rounded-3xl shadow-xl backdrop-blur-lg">
            {/* Input Section */}
            <div className="bg-black border border-blue-900/50 rounded-xl p-4 space-y-6">
              <h2 className="text-xl font-semibold text-white">Your Text</h2>
              <Select value={sourceLang} onValueChange={setSourceLang}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Textarea
                placeholder="Enter your text here"
                className="w-full p-4 rounded-xl bg-black/40 border border-white/10 focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <div className="flex justify-between items-center">
                <Button variant="solid" size="lg" onClick={handleTranslate}>
                  {isLoading ? <Loader className="animate-spin" /> : 'Translate'}
                </Button>
                <motion.div animate={controls} className="w-10 h-10 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full flex items-center justify-center cursor-pointer" onClick={handleSwapLanguages}>
                 
                </motion.div>
              </div>
            </div>

            {/* Output Section */}
            <div className="bg-black border border-pink-900/50 rounded-xl p-4 space-y-6">
              <h2 className="text-xl font-semibold text-white">Translation</h2>
              <Select value={targetLang} onValueChange={setTargetLang}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Textarea
                readOnly
                placeholder="Your translated text will appear here"
                className="w-full p-4 rounded-xl bg-black/40 border border-white/10 focus:border-pink-500 focus:ring focus:ring-pink-500 focus:ring-opacity-50"
                value={translatedText}
              />

              <div className="flex justify-between items-center">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleTextToSpeech}
                  disabled={!translatedText}
                >
                  {isLoading ? <Loader className="animate-spin" /> : 'Listen'}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => copyToClipboard(translatedText)}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>
          </div>

          {/* Recent Translations */}
          <div className="bg-black/50 p-8 rounded-3xl shadow-xl backdrop-blur-lg max-w-4xl w-full">
            <h3 className="text-2xl font-semibold text-white">Recent Translations</h3>
            <div className="space-y-4">
              {recentTranslations.length > 0 ? (
                recentTranslations.map((item, idx) => (
                  <div key={idx} className="bg-black/40 p-4 rounded-xl border border-gray-700 space-y-2">
                    <p className="text-sm text-gray-400">{item.from} → {item.to}</p>
                    <p className="text-white">{item.text}</p>
                    <p className="text-blue-400">{item.translation}</p>
                  </div>
                ))
              ) : (
                <p className="text-gray-400">No recent translations yet.</p>
              )}
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default TranslationApp;