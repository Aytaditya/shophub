"use client"

/* eslint-disable @typescript-eslint/no-unused-vars */
import type React from "react"
import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Send, Bot, User, Minimize2, Maximize2 } from "lucide-react"
import ReactMarkdown from "react-markdown"
import { useUser, SignInButton } from "@clerk/clerk-react"

interface Message {
  id: number
  text: string
  sender: "user" | "bot"
  timestamp: Date
}

interface QuickReply {
  display: string
  query: string
}

const Chatbot: React.FC = () => {
  const { isSignedIn } = useUser()

  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Hi! I'm your shopping assistant. How can I help you find the perfect product today?",
      sender: "bot",
      timestamp: new Date(),
    },
  ])
  const [inputValue, setInputValue] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen, isMinimized])

  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || inputValue
    if (!textToSend.trim()) return

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
      const response = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: textToSend }),
      })

      const data = await response.json()

      const botMessage: Message = {
        id: messages.length + 2,
        text: data.response,
        sender: "bot",
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, botMessage])
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
    if (e.key === "Enter") {
      handleSendMessage()
    }
  }

  const quickReplies: QuickReply[] = [
    { display: "Electronics", query: "show me some phones" },
    { display: "Show me deals", query: "what are the current deals and discounts available?" },
    { display: "Return policy", query: "what is your return and refund policy?" },
    { display: "Help me choose", query: "I need help choosing the right product for my needs" },
    { display: "Shipping info", query: "what are the shipping options and delivery times?" },
  ]

  const handleQuickReply = (reply: QuickReply) => {
    handleSendMessage(reply.query)
  }

  // If not signed in, show Sign-In button instead of chatbot
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

  return (
    <>
      {/* Chat Button */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 p-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full shadow-2xl hover:shadow-3xl transition-all duration-300 ${isOpen ? "hidden" : "block"}`}
      >
        <Bot className="h-6 w-6" />
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={`fixed bottom-6 right-6 z-50 w-96 sm:w-[28rem] lg:w-[32rem] bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden ${
              isMinimized ? "h-16" : "h-[580px]"
            }`}
          >
            {/* Header */}
            <div className="p-4 border-b border-white/20 bg-gradient-to-r from-blue-600/80 to-purple-600/80 backdrop-blur-sm text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 rounded-full w-10 h-10 flex items-center justify-center backdrop-blur-sm">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Shopping Assistant</h3>
                  <p className="text-xs text-white/70">Online now</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat Content */}
            {!isMinimized && (
              <div className="flex flex-col h-[calc(100%-80px)]">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white/5">
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`flex items-start space-x-2 max-w-[85%] ${
                          message.sender === "user" ? "flex-row-reverse space-x-reverse" : ""
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm ${
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
                          className={`px-4 py-3 rounded-2xl backdrop-blur-sm border ${
                            message.sender === "user"
                              ? "bg-blue-600/80 text-white border-blue-500/30"
                              : "bg-white/20 text-gray-800 border-white/30"
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
                              message.sender === "user" ? "text-blue-100" : "text-gray-600"
                            }`}
                          >
                            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {isTyping && (
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 bg-gradient-to-r from-purple-500/80 to-blue-500/80 rounded-full flex items-center justify-center backdrop-blur-sm">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce delay-100"></div>
                        <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce delay-200"></div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Quick Replies */}
                {messages.length === 1 && (
                  <div className="px-4 pb-2 bg-white/5 flex-shrink-0">
                    <p className="text-xs text-gray-700 mb-2">Quick replies:</p>
                    <div className="flex flex-wrap gap-2">
                      {quickReplies.map((reply, index) => (
                        <button
                          key={index}
                          onClick={() => handleQuickReply(reply)}
                          className="px-3 py-1 text-xs bg-blue-500/20 text-blue-800 rounded-full hover:bg-blue-500/30 transition-colors backdrop-blur-sm border border-blue-500/30"
                          title={reply.query}
                        >
                          {reply.display}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input */}
                <div className="p-4 border-t border-white/20 bg-white/10 backdrop-blur-sm flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Type your message..."
                      className="flex-1 px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-gray-800 placeholder-gray-600"
                      disabled={isTyping}
                    />
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleSendMessage()}
                      disabled={!inputValue.trim() || isTyping}
                      className="p-2 bg-blue-600/80 text-white rounded-full hover:bg-blue-700/80 transition backdrop-blur-sm disabled:opacity-50"
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
