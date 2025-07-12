"use client"
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useRef, useEffect } from "react"
import type React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Send, Bot, User, Minimize2, Maximize2, Mic, MicOff, Volume2, VolumeX, Mail, Check } from "lucide-react"
import ReactMarkdown from "react-markdown"
import { useUser, SignInButton } from "@clerk/clerk-react"
import ComparisonTable from "./comparison-table"

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

/* ──────────────────────────────────── */
/*              TYPES                  */
/* ──────────────────────────────────── */
interface Product {
  name: string
  description?: string
  price?: number | string
  rating?: number | string
  reviews?: number | string
  inStock?: boolean
  category?: string
  [key: string]: any
}

interface Message {
  id: number
  text: string
  sender: "user" | "bot"
  timestamp: Date
  products?: Product[]
  isComparison?: boolean
  showEmailConfirm?: boolean // NEW: For email confirmation
}

interface QuickReply {
  display: string
  query: string
}

interface VoiceState {
  isListening: boolean
  isSupported: boolean
  isSpeaking: boolean
  voiceEnabled: boolean
}

/* ──────────────────────────────────── */
/*            COMPONENT                */
/* ──────────────────────────────────── */
const Chatbot: React.FC = () => {
  const { isSignedIn, user } = useUser()
  const userName = user?.firstName || user?.username || "there"
  const userEmail = user?.primaryEmailAddress?.emailAddress || ""

  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [emailConfirmed, setEmailConfirmed] = useState(false)

  // Voice states
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isListening: false,
    isSupported: false,
    isSpeaking: false,
    voiceEnabled: true,
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const synthRef = useRef<SpeechSynthesis | null>(null)

  /* ─── Voice Setup ─── */
  useEffect(() => {
    // Check for speech recognition support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = false
      recognitionRef.current.lang = "en-US"

      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript
        setInputValue(transcript)
        setVoiceState((prev) => ({ ...prev, isListening: false }))
      }

      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error)
        setVoiceState((prev) => ({ ...prev, isListening: false }))
      }

      recognitionRef.current.onend = () => {
        setVoiceState((prev) => ({ ...prev, isListening: false }))
      }
    }

    // Check for speech synthesis support
    if ("speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis
    }

    setVoiceState((prev) => ({
      ...prev,
      isSupported: !!(SpeechRecognition && synthRef.current),
    }))
  }, [])

  /* ─── Email Management ─── */
  useEffect(() => {
    // Check if email was previously confirmed
    const confirmed = localStorage.getItem(`email-confirmed-${userEmail}`)
    setEmailConfirmed(confirmed === "true")

    // Initialize messages based on email confirmation status
    if (userEmail && !confirmed) {
      setMessages([
        {
          id: 1,
          text: `Hi ${userName}! I'm your shopping assistant. Before we start, I'd like to confirm your email address for a better experience.`,
          sender: "bot",
          timestamp: new Date(),
          showEmailConfirm: true,
        },
      ])
    } else {
      setMessages([
        {
          id: 1,
          text: `Hi ${userName}! I'm your shopping assistant. How can I help you find the perfect product today?`,
          sender: "bot",
          timestamp: new Date(),
        },
      ])
    }
  }, [userName, userEmail])

  /* ─── Voice Functions ─── */
  const startListening = () => {
    if (recognitionRef.current && voiceState.isSupported) {
      setVoiceState((prev) => ({ ...prev, isListening: true }))
      recognitionRef.current.start()
    }
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      setVoiceState((prev) => ({ ...prev, isListening: false }))
    }
  }

  const speakText = (text: string) => {
    if (synthRef.current && voiceState.voiceEnabled && !voiceState.isSpeaking) {
      // Cancel any ongoing speech
      synthRef.current.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.9
      utterance.pitch = 1
      utterance.volume = 0.8

      utterance.onstart = () => {
        setVoiceState((prev) => ({ ...prev, isSpeaking: true }))
      }

      utterance.onend = () => {
        setVoiceState((prev) => ({ ...prev, isSpeaking: false }))
      }

      utterance.onerror = () => {
        setVoiceState((prev) => ({ ...prev, isSpeaking: false }))
      }

      synthRef.current.speak(utterance)
    }
  }

  const toggleVoice = () => {
    if (voiceState.isSpeaking && synthRef.current) {
      synthRef.current.cancel()
    }
    setVoiceState((prev) => ({ ...prev, voiceEnabled: !prev.voiceEnabled }))
  }

  /* ─── Email Confirmation ─── */
  const confirmEmail = () => {
    localStorage.setItem(`email-confirmed-${userEmail}`, "true")
    setEmailConfirmed(true)

    const confirmMessage: Message = {
      id: messages.length + 1,
      text: "Perfect! Your email has been confirmed. Now, how can I help you find the perfect product today?",
      sender: "bot",
      timestamp: new Date(),
    }

    setMessages((prev) =>
      prev.map((msg) => (msg.showEmailConfirm ? { ...msg, showEmailConfirm: false } : msg)).concat(confirmMessage),
    )

    // Speak the confirmation if voice is enabled
    if (voiceState.voiceEnabled) {
      speakText(confirmMessage.text)
    }
  }

  const sendEmailToBot = () => {
    handleSendMessage(userEmail)
  }

  /* ─── helpers ─── */
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(scrollToBottom, [messages])

  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) inputRef.current.focus()
  }, [isOpen, isMinimized])

  // Helper function to detect if products are comparison data
  const isComparisonData = (products: Product[]): boolean => {
    if (products.length < 2) return false
    const hasCommonFields = products.every((product) => "price" in product && "rating" in product && "name" in product)
    return hasCommonFields
  }

  /* ─── network & message pipeline ─── */
  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || inputValue
    if (!textToSend.trim()) return

    // User message
    const userMessage: Message = {
      id: messages.length + 1,
      text: textToSend,
      sender: "user",
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue("")
    setIsTyping(true)

    try {
      const response = await fetch("http://localhost:8000/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: textToSend,
          email: emailConfirmed ? userEmail : "guest@example.com",
        }),
      })

      const data = await response.json()

      // Bot response
      const botMessage: Message = {
        id: messages.length + 2,
        text: data.answer ?? "Sorry, I didn't understand that.",
        sender: "bot",
        timestamp: new Date(),
      }

      // Speak bot response if voice is enabled
      if (voiceState.voiceEnabled) {
        speakText(botMessage.text)
      }

      // Product payload
      const productPayload =
        Array.isArray(data.products) && data.products.length > 0
          ? ({
              id: messages.length + 3,
              text: "",
              sender: "bot",
              timestamp: new Date(),
              products: data.products as Product[],
              isComparison: isComparisonData(data.products as Product[]),
            } satisfies Message)
          : null

      setMessages((prev) => (productPayload ? [...prev, botMessage, productPayload] : [...prev, botMessage]))
    } catch (error) {
      console.error("Error fetching bot response:", error)
      const errorMessage: Message = {
        id: messages.length + 2,
        text: "Sorry, I'm having trouble right now. Please try again later.",
        sender: "bot",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsTyping(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSendMessage()
  }

  /* ─── quick replies ─── */
  const quickReplies: QuickReply[] = [
    { display: "Electronics", query: "show me some phones" },
    { display: "Show me deals", query: "what are the current deals and discounts available?" },
    { display: "Return policy", query: "what is your return and refund policy?" },
    { display: "Help me choose", query: "I need help choosing the right product for my needs" },
    { display: "Shipping info", query: "what are the shipping options and delivery times?" },
  ]

  const handleQuickReply = (reply: QuickReply) => handleSendMessage(reply.query)

  /* ─── auth gate ─── */
  if (!isSignedIn) {
    return (
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-6 right-6 z-50 p-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full shadow-2xl hover:shadow-3xl transition-all duration-300"
      >
        <SignInButton mode="modal">
          <div className="flex items-center gap-2 cursor-pointer">
            <Bot className="h-5 w-5" />
            <span className="text-sm">Sign in to chat</span>
          </div>
        </SignInButton>
      </motion.button>
    )
  }

  /* ──────────────────────────────────── */
  /*           RENDER SECTION            */
  /* ──────────────────────────────────── */
  return (
    <>
      {/* FAB button */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 p-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full shadow-2xl hover:shadow-3xl transition-all duration-300 ${
          isOpen ? "hidden" : "block"
        }`}
      >
        <Bot className="h-6 w-6" />
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse" />
      </motion.button>

      {/* Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={`fixed bottom-6 right-6 z-50 w-96 sm:w-[28rem] lg:w-[40rem] bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden ${
              isMinimized ? "h-16" : "h-[580px]"
            }`}
          >
            {/* header */}
            <div className="p-4 border-b border-white/20 bg-gradient-to-r from-blue-600/80 to-purple-600/80 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 rounded-full w-10 h-10 flex items-center justify-center">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Shopping Assistant</h3>
                  <p className="text-xs text-white/70">{voiceState.isSpeaking ? "Speaking..." : "Online now"}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {/* Voice toggle */}
                {voiceState.isSupported && (
                  <button
                    onClick={toggleVoice}
                    className="p-1 hover:bg-white/20 rounded-lg"
                    title={voiceState.voiceEnabled ? "Disable voice" : "Enable voice"}
                  >
                    {voiceState.voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>
                )}
                <button onClick={() => setIsMinimized(!isMinimized)} className="p-1 hover:bg-white/20 rounded-lg">
                  {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                </button>
                <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/20 rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* body */}
            {!isMinimized && (
              <div className="flex flex-col h-[calc(100%-80px)]">
                {/* messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white/5">
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {/* Email confirmation component */}
                      {message.showEmailConfirm ? (
                        <div className="w-full max-w-full">
                          <div className="bg-white/90 rounded-lg p-4 shadow-lg backdrop-blur-sm border border-blue-200">
                            <div className="flex items-start space-x-2 mb-3">
                              <div className="w-8 h-8 bg-gradient-to-r from-purple-500/80 to-blue-500/80 rounded-full flex items-center justify-center">
                                <Bot className="h-4 w-4 text-white" />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm text-gray-800 mb-3">{message.text}</p>
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Mail className="h-4 w-4 text-blue-600" />
                                    <span className="text-sm font-medium text-blue-800">Email Address</span>
                                  </div>
                                  <p className="text-sm text-gray-700 mb-2">{userEmail}</p>
                                  <p className="text-xs text-gray-600">Is this your correct email address?</p>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={confirmEmail}
                                    className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                                  >
                                    <Check className="h-3 w-3" />
                                    Yes, confirm
                                  </button>
                                  <button
                                    onClick={() => handleSendMessage("I need to update my email address")}
                                    className="px-3 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors"
                                  >
                                    No, update it
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : message.products ? (
                        <div className="w-full max-w-full">
                          {message.isComparison ? (
                            <div className="bg-white/90 rounded-lg p-4 shadow-lg backdrop-blur-sm">
                              <h4 className="text-sm font-semibold mb-3 text-gray-800">Product Comparison</h4>
                              <ComparisonTable products={message.products} />
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {message.products.map((p, idx) => (
                                <div
                                  key={idx}
                                  className="w-56 bg-white/80 border border-gray-200 rounded-2xl shadow hover:shadow-lg transition p-4 backdrop-blur-sm"
                                >
                                  <h4 className="font-semibold text-sm mb-1">{p.name}</h4>
                                  <p className="text-xs text-gray-700 line-clamp-3">{p.description}</p>
                                  <div className="mt-2 flex items-center justify-between text-xs">
                                    <span className="font-medium text-green-700">₹{p.price}</span>
                                    {p.inStock ? (
                                      <span className="text-green-600">In stock</span>
                                    ) : (
                                      <span className="text-red-600">Out of stock</span>
                                    )}
                                  </div>
                                  {p.rating && (
                                    <p className="text-[11px] mt-1 text-yellow-700">
                                      ⭐ {p.rating} ({p.reviews ?? 0})
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className={`flex items-start space-x-2 max-w-[85%] ${
                            message.sender === "user" ? "flex-row-reverse space-x-reverse" : ""
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              message.sender === "user"
                                ? "bg-blue-600/80"
                                : "bg-gradient-to-r from-purple-500/80 to-blue-500/80"
                            }`}
                          >
                            {message.sender === "user" ? (
                              <User className="h-4 w-4 text-white" />
                            ) : (
                              <Bot className="h-4 w-4 text-white" />
                            )}
                          </div>
                          <div
                            className={`px-4 py-3 rounded-2xl border ${
                              message.sender === "user"
                                ? "bg-blue-600/80 text-white border-blue-500/30"
                                : "bg-white/20 text-gray-900 border-white/30"
                            }`}
                          >
                            <ReactMarkdown
                              components={{
                                p: ({ node, children }) => <p className="text-sm leading-relaxed">{children}</p>,
                              }}
                            >
                              {message.text}
                            </ReactMarkdown>
                            <p
                              className={`text-xs mt-1 ${
                                message.sender === "user" ? "text-blue-100" : "text-gray-900"
                              }`}
                            >
                              {message.timestamp.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))}

                  {/* typing indicator */}
                  {isTyping && (
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 bg-gradient-to-r from-purple-500/80 to-blue-500/80 rounded-full flex items-center justify-center">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce delay-100" />
                        <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce delay-200" />
                      </div>
                    </div>
                  )}

                  {/* Email quick action */}
                  {emailConfirmed && (
                    <div className="flex justify-center">
                      <button
                        onClick={sendEmailToBot}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm hover:bg-blue-200 transition-colors border border-blue-300"
                        title="Send your email to the bot"
                      >
                        <Mail className="h-3 w-3" />
                        <span>{userEmail}</span>
                      </button>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* quick replies */}
                {messages.length === 1 && !messages[0].showEmailConfirm && (
                  <div className="px-4 pb-2 bg-white/5">
                    <p className="text-xs text-gray-700 mb-2">Quick replies:</p>
                    <div className="flex flex-wrap gap-2">
                      {quickReplies.map((reply, index) => (
                        <button
                          key={index}
                          onClick={() => handleQuickReply(reply)}
                          className="px-3 py-1 text-xs bg-blue-500/20 text-blue-800 rounded-full hover:bg-blue-500/30 border border-blue-500/30"
                          title={reply.query}
                        >
                          {reply.display}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* input */}
                <div className="p-4 border-t border-white/20 bg-white/10">
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder={voiceState.isListening ? "Listening..." : "Type your message..."}
                      className="flex-1 px-4 py-2 bg-white/20 border border-white/30 rounded-full text-sm focus:outline-none text-black"
                      disabled={isTyping || voiceState.isListening}
                    />

                    {/* Voice input button */}
                    {voiceState.isSupported && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={voiceState.isListening ? stopListening : startListening}
                        className={`p-2 rounded-full transition-colors ${
                          voiceState.isListening
                            ? "bg-red-600/80 text-white"
                            : "bg-gray-600/80 text-white hover:bg-gray-700/80"
                        }`}
                        disabled={isTyping}
                      >
                        {voiceState.isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </motion.button>
                    )}

                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleSendMessage()}
                      disabled={!inputValue.trim() || isTyping || voiceState.isListening}
                      className="p-2 bg-blue-600/80 text-white rounded-full hover:bg-blue-700/80 disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                    </motion.button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default Chatbot
