import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import chatOptions from "../data/chatOptions.json";
import Navbar from "../components/Navbar";
import ReactMarkdown from "react-markdown";
import "../styles/Chat.css";

const Chat = () => {
  const { id } = useParams(); //Chat ID
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]); // visible messages: { role, content }
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [systemPrompt, setSystemPrompt] = useState(null);
  const [brevity, setBrevity] = useState(
    localStorage.getItem("chat_brevity") || "normal"
  );
  const [fontSize, setFontSize] = useState(
    parseInt(localStorage.getItem("chat_fontSize")) || 16
  );
  const [letterSpacing, setLetterSpacing] = useState(
    parseFloat(localStorage.getItem("chat_letterSpacing")) || 0
  );
  const [lineHeight, setLineHeight] = useState(
    parseFloat(localStorage.getItem("chat_lineHeight")) || 1.2
  );
  const [showControls, setShowControls] = useState(true); // Controls visibility

  const messagesEndRef = useRef(null);
  const chatDetails = chatOptions.chats.find((chat) => chat.id === id);

  /*
  FRONTEND SUPPORT
  */
  // validation helper
  function validationCheck(str) {
    return str === null || str.match(/^\s*$/) !== null;
  }

  // Convert backend content-format -> visible message
  const backendToVisible = (backendMsg) => {
    // backendMsg is like: { role: 'user'|'model', parts: [{ text: '...' }, ...] }
    const textPart =
      Array.isArray(backendMsg.parts) &&
      backendMsg.parts[0] &&
      backendMsg.parts[0].text
        ? backendMsg.parts[0].text
        : "";
    return { role: backendMsg.role, content: textPart };
  };

  // Convert visible -> backend
  const visibleToBackend = (visibleMsg) => {
    return { role: visibleMsg.role, parts: [{ text: visibleMsg.content }] };
  };

  // Clear chat history and reset the session
  const clearChatHistory = () => {
    const archetypePrompt = `You are a specialist in the field of ${
      chatDetails.title
    }. ${chatDetails.instruction}. ${
      brevity === "brief"
        ? "Please keep your responses concise and to the point."
        : brevity === "detailed"
        ? "Please provide detailed and thorough responses."
        : "Provide balanced responses."
    }`;

    localInitializeSession(archetypePrompt);
    setError(null);
  };

  // Local initialization: create backend-friendly initial history and visible greeting
  const localInitializeSession = (archetypePrompt) => {
    const initialAckBackend = {
      role: "model",
      parts: [{ text: `Initialized as ${chatDetails.title} specialist.` }],
    };

    sessionStorage.setItem(`chat_system_prompt_${id}`, archetypePrompt);
    sessionStorage.setItem(
      `chat_history_${id}`,
      JSON.stringify([initialAckBackend])
    );

    setSystemPrompt(archetypePrompt);

    // user-visible greeting (keep UX identical)
    setMessages([
      {
        role: "model",
        content: `Hello! I'm your ${chatDetails.title} model. How can I help you today?`,
      },
    ]);
  };

  // Load or initialize session
  useEffect(() => {
    if (!chatDetails) {
      navigate("/");
      return;
    }

    const storedBackendHistoryRaw = sessionStorage.getItem(
      `chat_history_${id}`
    );
    const storedSystemPrompt = sessionStorage.getItem(
      `chat_system_prompt_${id}`
    );
    if (storedBackendHistoryRaw && storedSystemPrompt) {
      setSystemPrompt(storedSystemPrompt);
      try {
        const backendHistory = JSON.parse(storedBackendHistoryRaw);
        const visible = backendHistory.map(backendToVisible);
        setMessages(visible);
      } catch (err) {
        console.error("Bad stored history, reinitializing:", err);
        const archetypePrompt = `You are a specialist in the field of ${chatDetails.title}. ${chatDetails.instruction}. Only answer questions strictly relevant to your specialty.`;
        localInitializeSession(archetypePrompt);
      }
    } else {
      const archetypePrompt = `You are a specialist in the field of ${chatDetails.title}. ${chatDetails.instruction}. Only answer questions strictly relevant to your specialty.`;
      localInitializeSession(archetypePrompt);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatDetails, navigate, id]);

  useEffect(() => {
    localStorage.setItem("chat_brevity", brevity);
    localStorage.setItem("chat_fontSize", fontSize);
    localStorage.setItem("chat_letterSpacing", letterSpacing);
    localStorage.setItem("chat_lineHeight", lineHeight);
  }, [brevity, fontSize, letterSpacing, lineHeight]);

  // auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // handle submit using backend-friendly history format (parts/text)
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validationCheck(input) || isLoading || !systemPrompt) return;

    // Build visible user message and backend user message
    const userVisible = { role: "user", content: input.trim() };
    const userBackend = visibleToBackend(userVisible);

    // Load stored backend history
    const storedBackendHistoryRaw =
      sessionStorage.getItem(`chat_history_${id}`) || "[]";
    let storedBackendHistory = [];
    try {
      storedBackendHistory = JSON.parse(storedBackendHistoryRaw);
      if (!Array.isArray(storedBackendHistory)) storedBackendHistory = [];
    } catch (err) {
      storedBackendHistory = [];
    }

    // Prepare backend history to send: stored ack + all previous backend entries + this user message
    const backendHistoryToSend = [...storedBackendHistory, userBackend];

    // Optimistically update visible UI with user message
    const visibleWithUser = [...messages, userVisible];
    setMessages(visibleWithUser);
    setInput("");
    setIsLoading(true);
    setError(null);

    // POST body matches your Flask app: { chat: <string>, history: [ backend content objects ] }
    const body = {
      chat: input,
      history: backendHistoryToSend,
    };
    try {
      // Add these lines:
      const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1";
      const API_PORT = process.env.REACT_APP_API_PORT || "9000";

      const res = await fetch(`${API_URL}:${API_PORT}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify(body),
      });

      let modelText = "";
      if (!res.ok) {
        // Server error — set a fallback message
        modelText = "Error occurred";
      } else {
        const data = await res.json().catch(() => null);
        // Your Flask returns { "text": response.text }
        modelText = (data && (data.text ?? data.message)) ?? "No response";
      }

      const assistantBackend = {
        role: "model",
        parts: [{ text: modelText }],
      };

      // Update persisted backend history: stored ack + user + assistant
      const finalBackendHistory = [...backendHistoryToSend, assistantBackend];
      sessionStorage.setItem(
        `chat_history_${id}`,
        JSON.stringify(finalBackendHistory)
      );

      // Update visible messages from the backend history to keep them in sync
      const visibleFromBackend = finalBackendHistory.map(backendToVisible);
      setMessages(visibleFromBackend);
    } catch (err) {
      console.error("Error contacting /chat:", err);

      // Show an error reply in the UI but do NOT overwrite persisted (server) history
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
      setError("Failed to contact server. See console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle brevity change
  const handleBrevityChange = (level) => {
    setBrevity(level);
    // Reinitialize with new brevity setting
    clearChatHistory();
  };

  const FontTools = {
    Font: {
      value: fontSize,
      min: 12,
      max: 24,
      step: 1,
      oc: (e) => setFontSize(parseInt(e.target.value)),
    },
    "Line Height": {
      value: lineHeight,
      min: 0.5,
      max: 2.5,
      step: 0.1,
      oc: (e) => setLineHeight(parseInt(e.target.value)),
    },
    "Letter Spacing": {
      value: letterSpacing,
      min: -5,
      max: 3,
      step: 1,
      oc: (e) => setLetterSpacing(parseInt(e.target.value)),
    },
  };
  return (
    <div className="chat-container">
      <Navbar />
      <div className="chat-header">
        <div className="header-content">
          <div className="header-main">
            <div>
              <h1>{chatDetails.title} Chat</h1>
              <p>{chatDetails.description}</p>
            </div>
            <button
              className="toggle-controls-btn"
              onClick={() => setShowControls(!showControls)}
              title={showControls ? "Hide controls" : "Show controls"}
            >
              {showControls ? "▲ Hide Controls" : "▼ Show Controls"}
            </button>
          </div>
          <div className={`chat-controls ${!showControls ? "hidden" : ""}`}>
            <div className="brevity-controls">
              <span>Response Style: </span>
              <button
                className={`brevity-btn ${brevity === "brief" ? "active" : ""}`}
                onClick={() => handleBrevityChange("brief")}
                title="Concise responses"
              >
                Brief
              </button>
              <button
                className={`brevity-btn ${
                  brevity === "normal" ? "active" : ""
                }`}
                onClick={() => handleBrevityChange("normal")}
                title="Balanced responses"
              >
                Normal
              </button>
              <button
                className={`brevity-btn ${
                  brevity === "detailed" ? "active" : ""
                }`}
                onClick={() => handleBrevityChange("detailed")}
                title="Detailed responses"
              >
                Detailed
              </button>
            </div>
            <button
              className="clear-history-btn"
              onClick={clearChatHistory}
              title="Clear chat history"
              disabled={isLoading}
            >
              Clear History
            </button>
            {Object.entries(FontTools).map(([name, t]) => (
              <div className="size-control" key={name}>
                <span>
                  {name}: {t.value}
                  {name === "Line Height" ? "" : "px"}
                </span>
                <input
                  type="range"
                  min={t.min}
                  max={t.max}
                  step={t.step}
                  value={t.value}
                  onChange={t.oc}
                  className="size-slider"
                  title={`Adjust ${name}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className="chat-messages"
        style={{
          "--message-font-size": `${fontSize}px`,
          "--message-letter-spacing": `${letterSpacing}px`,
          "--message-line-height": `${lineHeight}`,
        }}
      >
        {messages.map((message, index) => (
          <div
            key={index}
            className={`message ${message.role === "user" ? "user" : "ai"}`}
          >
            <div className="message-content">
              <div className="message-sender">
                {message.role === "user" ? "You" : "AI"}
              </div>
              <div className="message-text">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="message ai">
            <div className="message-content">
              <div className="message-sender">AI</div>
              <div className="message-text typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-input-container">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            systemPrompt
              ? `Message about ${chatDetails.title}... (Shift+Enter for new line)`
              : "Starting chat session..."
          }
          className="chat-input"
          onKeyDown={handleKeyDown}
          disabled={isLoading || !systemPrompt}
        />
        <button
          type="submit"
          className="send-button"
          disabled={isLoading || !input.trim() || !systemPrompt}
        >
          {isLoading ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
};

export default Chat;
