import React, { useState } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Sparkles, Send, Loader2, BookOpen, Lightbulb, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

export default function AIHomeworkHelper() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ answer: string; examples: string[] } | null>(null);

  async function askAI() {
    if (!question.trim()) return;
    setLoading(true);
    setResponse(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3.1-pro-preview";
      
      const prompt = `You are a helpful AI Homework Helper for students. 
      A student has asked the following question: "${question}"
      
      Please provide:
      1. A clear and simplified answer that is easy for a student to understand.
      2. 2-3 practical, real-world examples that illustrate the concept.`;

      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: {
                type: Type.STRING,
                description: "A clear and simplified answer that is easy for a student to understand (markdown supported)."
              },
              examples: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "2-3 practical, real-world examples that illustrate the concept."
              }
            },
            required: ["answer", "examples"]
          }
        }
      });

      const text = result.text;
      if (text) {
        const parsed = JSON.parse(text);
        setResponse(parsed);
      }
    } catch (error) {
      console.error('AI Error:', error);
      setResponse({
        answer: "Sorry, I encountered an error while trying to help you. Please try again later.",
        examples: []
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-[2rem] shadow-xl shadow-purple-100/50 border border-purple-50 overflow-hidden">
      <div className="p-6 md:p-8 bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-black tracking-tight">AI Homework Helper</h2>
        </div>
        <p className="text-purple-100 font-medium">Ask any question and get a simplified explanation with examples!</p>
      </div>

      <div className="p-6 md:p-8 space-y-6">
        <div className="relative group">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What would you like to learn about today? (e.g., How do plants make food?)"
            className="w-full h-32 p-4 bg-purple-50/50 border-2 border-purple-100 rounded-2xl focus:ring-4 focus:ring-purple-500/10 focus:border-purple-400 focus:bg-white outline-none transition-all text-purple-900 font-medium placeholder:text-purple-300 resize-none"
          />
          <button
            onClick={askAI}
            disabled={loading || !question.trim()}
            className="absolute bottom-4 right-4 bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-xl shadow-lg shadow-purple-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed group-hover:scale-105 active:scale-95"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>

        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <div className="relative mb-4">
                <div className="w-16 h-16 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin" />
                <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-purple-600 animate-pulse" />
              </div>
              <p className="text-purple-900 font-bold">Thinking... I'm gathering the best explanation for you!</p>
              <p className="text-purple-400 text-sm mt-1">This will only take a moment.</p>
            </motion.div>
          )}

          {response && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="p-6 bg-purple-50 rounded-2xl border border-purple-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <BookOpen className="w-24 h-24 text-purple-600" />
                </div>
                <div className="flex items-center gap-2 mb-4 text-purple-900 font-black uppercase tracking-widest text-xs">
                  <MessageSquare className="w-4 h-4" />
                  <span>The Explanation</span>
                </div>
                <div className="prose prose-purple max-w-none text-purple-900 font-medium">
                  <ReactMarkdown>{response.answer}</ReactMarkdown>
                </div>
              </div>

              {response.examples.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {response.examples.map((example, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.1 }}
                      className="p-5 bg-white border-2 border-fuchsia-50 rounded-2xl shadow-sm hover:shadow-md hover:border-fuchsia-100 transition-all group"
                    >
                      <div className="flex items-center gap-2 mb-2 text-fuchsia-600 font-black uppercase tracking-widest text-[10px]">
                        <Lightbulb className="w-3 h-3 group-hover:animate-bounce" />
                        <span>Example {index + 1}</span>
                      </div>
                      <p className="text-slate-700 font-medium leading-relaxed">{example}</p>
                    </motion.div>
                  ))}
                </div>
              )}

              <button
                onClick={() => {
                  setQuestion('');
                  setResponse(null);
                }}
                className="w-full py-4 text-purple-600 font-bold hover:bg-purple-50 rounded-2xl transition-all border-2 border-dashed border-purple-100"
              >
                Ask another question
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
