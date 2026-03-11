import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import chatOptions from "../data/chatOptions.json";
import Navbar from "../components/Navbar";
import ReactMarkdown from "react-markdown";
import "../styles/Chat.css";
import { BACKEND_URL } from "../config";

const DEFAULTS = {
  brevity: "normal",
  fontSize: 16,
  letterSpacing: 0,
  lineHeight: 1.2,
};
const lsGet = (k, fallback) => localStorage.getItem(k) ?? fallback;

const toBackend = ({ role, content }) => ({ role, parts: [{ text: content }] });
const toVisible = ({ role, parts }) => ({
  role,
  content: parts?.[0]?.text ?? "",
});

export default function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [systemPrompt, setSystemPrompt] = useState(null);
  const [settings, setSettings] = useState({
    brevity: lsGet("chat_brevity", DEFAULTS.brevity),
    fontSize: Number(lsGet("chat_fontSize", DEFAULTS.fontSize)),
    letterSpacing: Number(lsGet("chat_letterSpacing", DEFAULTS.letterSpacing)),
    lineHeight: Number(lsGet("chat_lineHeight", DEFAULTS.lineHeight)),
  });
  const [showControls, setShowControls] = useState(false);
  const bottomRef = useRef(null);

  const chatDetails = chatOptions.chats.find((c) => c.id === id);

  // Persist settings
  useEffect(() => {
    Object.entries(settings).forEach(([k, v]) =>
      localStorage.setItem(`chat_${k}`, v),
    );
  }, [settings]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Init session
  const initSession = (prompt) => {
    const ack = {
      role: "model",
      parts: [{ text: `Initialized as ${chatDetails.title} specialist.` }],
    };
    sessionStorage.setItem(`chat_system_prompt_${id}`, prompt);
    sessionStorage.setItem(`chat_history_${id}`, JSON.stringify([ack]));
    setSystemPrompt(prompt);
    setMessages([
      {
        role: "model",
        content: `Hello! I'm your ${chatDetails.title} model. How can I help you today?`,
      },
    ]);
  };

  const buildPrompt = (brevity) =>
    `You are a specialist in ${chatDetails.title}. ${chatDetails.instruction} ${
      brevity === "brief"
        ? "Provide responses that are BRIEF and CONCISE. Try to limit yourself to 200 words."
        : brevity === "detailed"
          ? "Provide responses that are THOROUGH and PRECISE. Try to limit yourself between 1000 and 2000 words."
          : "Provide responses that are CONCISE AND PRECISE. Try to limit yourself between 400 and 1000 words."
    }`;

  useEffect(() => {
    if (!chatDetails) return navigate("/");
    const stored = sessionStorage.getItem(`chat_history_${id}`);
    const storedPrompt = sessionStorage.getItem(`chat_system_prompt_${id}`);
    if (stored && storedPrompt) {
      setSystemPrompt(storedPrompt);
      try {
        setMessages(JSON.parse(stored).map(toVisible));
      } catch {
        initSession(buildPrompt(settings.brevity));
      }
    } else {
      initSession(buildPrompt(settings.brevity));
    }
  }, [id]); // eslint-disable-line

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!input.trim() || isLoading || !systemPrompt) return;

    const userMsg = { role: "user", content: input.trim() };
    const history = (() => {
      try {
        return JSON.parse(sessionStorage.getItem(`chat_history_${id}`) || "[]");
      } catch {
        return [];
      }
    })();
    const backendHistory = [...history, toBackend(userMsg)];
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setError(null);

    const assistantMsg = { role: "model", parts: [{ text: "" }] };
    try {
      const res = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat: userMsg.content,
          history: backendHistory,
          prompt: systemPrompt,
        }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let modelText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        modelText += decoder.decode(value).replace(/^data: /gm, "");
        assistantMsg.parts = [{ text: modelText }];
        setMessages([...backendHistory, assistantMsg].map(toVisible));
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
      setError("Failed to contact server.");
    } finally {
      sessionStorage.setItem(
        `chat_history_${id}`,
        JSON.stringify([...backendHistory, assistantMsg]),
      );
      setIsLoading(false);
    }
  };

  const setSetting = (k) => (v) => setSettings((s) => ({ ...s, [k]: v }));

  const sliders = [
    { label: "Font", key: "fontSize", min: 8, max: 24, step: 1, unit: "px" },
    {
      label: "Line Height",
      key: "lineHeight",
      min: 0.5,
      max: 2.5,
      step: 0.1,
      unit: "",
    },
    {
      label: "Letter Spacing",
      key: "letterSpacing",
      min: -5,
      max: 3,
      step: 1,
      unit: "px",
    },
  ];

  return (
    <div className="chat-container">
      <Navbar />

      <div className={`chat-header ${!showControls ? "compact" : ""}`}>
        <div className="header-content">
          <div className={`header-main ${!showControls ? "compact" : ""}`}>
            <div>
              <h1>{chatDetails?.title} Chat</h1>
              {showControls && <p>{chatDetails?.description}</p>}
            </div>
            <button
              className="toggle-controls-btn"
              onClick={() => setShowControls((s) => !s)}
            >
              {showControls ? "▲ Hide" : "▼ Show Controls"}
            </button>
          </div>

          {showControls && (
            <div className="chat-controls">
              <div className="brevity-controls">
                <span>Response Style: </span>
                {["brief", "normal", "detailed"].map((level) => (
                  <button
                    key={level}
                    className={`brevity-btn ${settings.brevity === level ? "active" : ""}`}
                    onClick={() => {
                      setSetting("brevity")(level);
                      setSystemPrompt(buildPrompt(level));
                      sessionStorage.setItem(`chat_system_prompt_${id}`, prompt);
                    }}
                  >
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </button>
                ))}
              </div>
              <div className="action-buttons">
                <button
                  className="clear-history-btn"
                  onClick={() => {
                    initSession(buildPrompt(settings.brevity));
                    setError(null);
                  }}
                  disabled={isLoading}
                >
                  Clear History
                </button>
                <button
                  className="reset-settings-btn"
                  onClick={() => setSettings(DEFAULTS)}
                  disabled={isLoading}
                >
                  Reset Settings
                </button>
              </div>
              {sliders.map(({ label, key, min, max, step, unit }) => (
                <div className="size-control" key={key}>
                  <span>
                    {label}: {settings[key]}
                    {unit}
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={settings[key]}
                    onChange={(e) => setSetting(key)(Number(e.target.value))}
                    className="size-slider"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className="chat-messages"
        style={{
          "--message-font-size": `${settings.fontSize}px`,
          "--message-letter-spacing": `${settings.letterSpacing}px`,
          "--message-line-height": settings.lineHeight,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`message ${msg.role === "user" ? "user" : "ai"}`}
          >
            <div className="message-content">
              <div className="message-sender">
                {msg.role === "user" ? "You" : "AI"}
              </div>
              <div className="message-text">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message ai">
            <div className="message-content">
              <div className="message-sender">AI</div>
              <div className="message-text typing-indicator">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}
        {error && <div className="error-message">{error}</div>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-input-container">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            systemPrompt
              ? `Message about ${chatDetails?.title}... (Shift+Enter for new line)`
              : "Starting chat session..."
          }
          className="chat-input"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
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
}
