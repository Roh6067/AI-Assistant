
import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Menu,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import "./App.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_URL = `${import.meta.env.VITE_API_URL}/chat`;

const UPLOAD_URL = `${import.meta.env.VITE_API_URL}/upload-resume`;

function createChat() {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
  };
}

export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [resumeName, setResumeName] = useState("");
  const [chats, setChats] = useState([createChat()]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [candidateName, setCandidateName] = useState("");
  const bottomRef = useRef(null);

  const activeChat =
    chats.find((chat) => chat.id === activeId) || chats[0];

  useEffect(() => {
    if (!activeId && chats.length > 0) {
      setActiveId(chats[0].id);
    }
  }, [activeId, chats]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages, loading]);

  function newChat() {
    const chat = createChat();
    setChats((previous) => [chat, ...previous]);
    setActiveId(chat.id);
    setInput("");
  }

  function deleteChat(id) {
    const remaining = chats.filter((chat) => chat.id !== id);

    if (remaining.length === 0) {
      const chat = createChat();
      setChats([chat]);
      setActiveId(chat.id);
      return;
    }

    setChats(remaining);

    if (activeId === id) {
      setActiveId(remaining[0].id);
    }
  }

  
async function sendMessage(event) {
  event.preventDefault();

  const content = input.trim();

  if (!content || loading || !activeChat) return;
  if (!sessionId) {
  alert("Please upload your resume first.");
  return;
}

  const chatId = activeChat.id;
  const updatedMessages = [
    ...activeChat.messages,
    { role: "user", content },
  ];

  setInput("");
  setLoading(true);

  // Add the user message and an empty assistant message.
  setChats((previous) =>
    previous.map((chat) =>
      chat.id === chatId
        ? {
            ...chat,
            title:
              chat.messages.length === 0
                ? content.slice(0, 32)
                : chat.title,
            messages: [
              ...updatedMessages,
              { role: "assistant", content: "" },
            ],
          }
        : chat
    )
  );

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: sessionId,
        messages: updatedMessages
    })
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `Backend error (${response.status}): ${details}`
      );
    }

    if (!response.body) {
      throw new Error("Streaming response body is unavailable.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      const chunk = decoder.decode(value, { stream: true });

      if (chunk) {
        setChats((previous) =>
          previous.map((chat) => {
            if (chat.id !== chatId) return chat;

            const messages = [...chat.messages];
            const lastIndex = messages.length - 1;

            messages[lastIndex] = {
              ...messages[lastIndex],
              content: messages[lastIndex].content + chunk,
            };

            return { ...chat, messages };
          })
        );
      }
    }

    // Flush any remaining decoded text.
    const remaining = decoder.decode();

    if (remaining) {
      setChats((previous) =>
        previous.map((chat) => {
          if (chat.id !== chatId) return chat;

          const messages = [...chat.messages];
          const lastIndex = messages.length - 1;

          messages[lastIndex] = {
            ...messages[lastIndex],
            content: messages[lastIndex].content + remaining,
          };

          return { ...chat, messages };
        })
      );
    }
  } catch (error) {
    setChats((previous) =>
      previous.map((chat) => {
        if (chat.id !== chatId) return chat;

        const messages = [...chat.messages];
        const lastIndex = messages.length - 1;

        messages[lastIndex] = {
          ...messages[lastIndex],
          content:
            messages[lastIndex].content ||
            `Sorry, something went wrong: ${error.message}`,
        };

        return { ...chat, messages };
      })
    );
  } finally {
    setLoading(false);
  }
}

const uploadResume = async (file) => {
  if (!file) return;

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    alert("Please select a PDF file");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert("PDF must be smaller than 5 MB");
    return;
  }

  setUploading(true);

  try {
    const formData = new FormData();

    formData.append("file", file);

    const response = await fetch(
      UPLOAD_URL,
      {
        method: "POST",
        body: formData,
      }
    );

    const responseText = await response.text();

let data = {};

try {
  data = responseText ? JSON.parse(responseText) : {};
} catch {
  throw new Error(
    `Invalid server response. Status: ${response.status}. Check backend URL.`
  );
}

if (!response.ok) {
  throw new Error(
    data.detail || data.message || `Upload failed: ${response.status}`
  );
}

setSessionId(data.session_id);
setResumeName(file.name);
setCandidateName(data.candidate_name || "");

    alert("Resume uploaded successfully!");

  } catch (error) {
    alert(error.message);
  } finally {
    setUploading(false);
  }
};


  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "" : "closed"}`}>
        <div className="sidebar-top">
          <div className="brand">
            <div className="brand-icon">
              <Sparkles size={20} />
            </div>
            <span>AI Assistant</span>
          </div>

          <button
            className="icon-button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={19} />
          </button>
        </div>

        <button className="new-chat" onClick={newChat}>
          <Plus size={18} />
          <span>New chat</span>
        </button>

        {/* upload resume button */}
        <div className="resume-upload">

            <label htmlFor="resume-file" className="upload-btn">
              {uploading ? "Uploading..." : "Upload Resume"}
            </label>

            <input
              id="resume-file"
              type="file"
              accept=".pdf,application/pdf"
              hidden
              disabled={uploading}
              onChange={(e) => {
                uploadResume(e.target.files[0]);
                e.target.value = "";
              }}
            />

            {resumeName && (
              <p className="uploaded-file">
                📄 {resumeName}
              </p>
            )}

          </div>

        <p className="section-label">YOUR CHATS</p>

        <div className="chat-list">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`chat-item ${
                chat.id === activeChat?.id ? "active" : ""
              }`}
            >
              <button
                className="chat-select"
                onClick={() => setActiveId(chat.id)}
              >
                <MessageSquare size={16} />
                <span>{chat.title}</span>
              </button>

              <button
                className="delete-chat"
                onClick={() => deleteChat(chat.id)}
                aria-label="Delete chat"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <Bot size={18} />
          <span>Powered by FastAPI + Groq</span>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          {!sidebarOpen && (
            <button
              className="icon-button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu size={21} />
            </button>
          )}

          <div className="topbar-title">
            <span>AI Assistant</span>
            <span className="model-label">AI Assistant</span>
          </div>

          <button className="icon-button" onClick={newChat}>
            <Plus size={20} />
          </button>

          
        </header>

        <section className="conversation">
          {activeChat?.messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-icon">
                <Sparkles size={27} />
              </div>

              <h1>I'm {candidateName || activeChat?.title || "your"} AI Assistant</h1>
              <p>
                Ask questions, get answers, and explore {candidateName || "Rohan"}'s projects and experience.
              </p>

              <div className="suggestions">
                {[
                  "Explain his projects and experience",
                  "Does he know c language?",
                  "docker certification",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            
              <div className="messages">
                {activeChat?.messages.map((message, index) => {
                  // Hide the empty assistant message while waiting for streaming
                  if (message.role === "assistant" && !message.content) {
                    return null;
                  }
                
                  return (
                    <div
                      key={index}
                      className={`message-row ${message.role}`}
                    >
                      <div className="avatar">
                        {message.role === "user" ? (
                          <User size={17} />
                        ) : (
                          <Bot size={18} />
                        )}
                      </div>
                      
                      <div className="message-content">
                        <div className="message-name">
                          {message.role === "user"
                            ? "You"
                            : "AI Assistant"}
                        </div>
                        
                        <div className="message-text">
                          {message.role === "assistant" ? (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.content}
                            </ReactMarkdown>
                          ) : (
                            message.content
                          )}
                        </div>

                      </div>
                    </div>
                  );
                })}

                {loading && (
                  <div className="message-row assistant">
                    <div className="avatar">
                      <Bot size={18} />
                    </div>
                
                    <div className="typing">
                      <span />
                      <span />
                      <span />
                      <small>Thinking...</small>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
          )}
        </section>

        <footer className="composer-area">
          <form className="composer" onSubmit={sendMessage}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form.requestSubmit();
                }
              }}
              placeholder="Ask me anything..."
              rows={1}
              disabled={loading}
            />

            <button
              type="submit"
              className="send-button"
              disabled={!input.trim() || loading}
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </form>

       
        </footer>
      </main>
    </div>
  );
}
