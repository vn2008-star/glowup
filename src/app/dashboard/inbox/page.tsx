"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./inbox.module.css";
import type { Conversation, Message } from "@/lib/types";

const CHANNEL_ICONS: Record<string, string> = {
  sms: "💬",
  instagram: "📸",
  facebook: "📘",
  web: "🌐",
};

const QUICK_REPLIES = [
  "Thanks for reaching out! Let me check our availability for you.",
  "We'd love to book you in! What day works best?",
  "Our hours are Mon–Sat, 9am–6pm. Walk-ins welcome!",
  "Yes, we offer that service! Here's our pricing: ",
  "Your appointment is confirmed! See you then 💕",
];

const BOT_CONFIG_DEFAULTS = {
  greeting: "Hi there! 👋 Welcome to our salon. How can I help you today?",
  after_hours: "Thanks for your message! We're currently closed but will get back to you first thing tomorrow. Our hours are Mon–Sat, 9am–6pm.",
  booking_prompt: "Would you like to book an appointment? I can help you find an available time!",
  faq: [
    { q: "What are your hours?", a: "We're open Monday through Saturday, 9am to 6pm." },
    { q: "Do you accept walk-ins?", a: "Yes! Walk-ins are welcome, though we recommend booking to guarantee your spot." },
    { q: "Where are you located?", a: "Check our website for directions and parking info!" },
  ],
};

export default function InboxPage() {
  const { tenant } = useTenant();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState("");
  const [activeTab, setActiveTab] = useState<"inbox" | "config">("inbox");
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Bot config state
  const [botConfig, setBotConfig] = useState(BOT_CONFIG_DEFAULTS);

  const fetchConversations = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    const { data } = await queryData<Conversation[]>("conversations.list", filter === "all" ? {} : { status: filter });
    setConversations(data || []);
    setLoading(false);
  }, [tenant, filter]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  useEffect(() => {
    // Load bot config from tenant settings
    if (tenant) {
      const settings = (tenant.settings || {}) as Record<string, unknown>;
      const saved = settings.bot_config as typeof BOT_CONFIG_DEFAULTS | undefined;
      if (saved) setBotConfig({ ...BOT_CONFIG_DEFAULTS, ...saved });
    }
  }, [tenant]);

  async function selectConversation(convo: Conversation) {
    setSelectedConvo(convo);
    const { data } = await queryData<Message[]>("messages.list", { conversation_id: convo.id });
    setMessages(data || []);

    // Mark as read
    if (convo.unread_count > 0) {
      await queryData("conversations.update", { id: convo.id, unread_count: 0 });
      setConversations((prev) => prev.map((c) => c.id === convo.id ? { ...c, unread_count: 0 } : c));
    }

    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!messageText.trim() || !selectedConvo) return;

    const { data } = await queryData<Message>("messages.add", {
      conversation_id: selectedConvo.id,
      sender_type: "staff",
      sender_name: "You",
      content: messageText,
    });

    if (data) {
      setMessages((prev) => [...prev, data]);
      setConversations((prev) => prev.map((c) =>
        c.id === selectedConvo.id ? { ...c, last_message: data.content, last_message_at: data.created_at } : c
      ));
      setMessageText("");
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  function useQuickReply(text: string) {
    setMessageText(text);
    setShowQuickReplies(false);
  }

  async function handleCloseConvo() {
    if (!selectedConvo) return;
    const newStatus = selectedConvo.status === "open" ? "closed" : "open";
    await queryData("conversations.update", { id: selectedConvo.id, status: newStatus });
    setConversations((prev) => prev.map((c) =>
      c.id === selectedConvo.id ? { ...c, status: newStatus } : c
    ));
    setSelectedConvo((prev) => prev ? { ...prev, status: newStatus } : prev);
  }

  async function handleNewConversation() {
    const { data } = await queryData<Conversation>("conversations.add", {
      channel: "sms",
      status: "open",
      last_message: "New conversation started",
    });
    if (data) {
      setConversations((prev) => [data, ...prev]);
      setSelectedConvo(data);
      setMessages([]);
    }
  }

  async function saveBotConfig() {
    const res = await fetch("/api/save-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: {
          ...((tenant?.settings || {}) as Record<string, unknown>),
          bot_config: botConfig,
        },
      }),
    });
    if (res.ok) alert("Bot configuration saved!");
  }

  const openCount = conversations.filter((c) => c.status === "open").length;
  const unreadCount = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  function getConvoName(c: Conversation) {
    if (c.client) return `${c.client.first_name} ${c.client.last_name || ""}`.trim();
    return `${CHANNEL_ICONS[c.channel] || "💬"} ${c.channel.toUpperCase()} Chat`;
  }

  return (
    <div className={styles.page}>
      {/* Tabs */}
      <div className={styles.pageHeader}>
        <div>
          <h1>AI Receptionist & Inbox</h1>
          <p>{openCount} open conversations · {unreadCount} unread</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className={`btn ${activeTab === "inbox" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("inbox")}>Inbox</button>
          <button className={`btn ${activeTab === "config" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("config")}>⚙️ Configure AI</button>
        </div>
      </div>

      {activeTab === "config" ? (
        <div className={styles.configPanel}>
          <div className={`card ${styles.configCard}`}>
            <h2>AI Bot Settings</h2>
            <p className={styles.configDesc}>Configure how your AI receptionist responds to client messages.</p>

            <div className={styles.configGroup}>
              <label className="label">Greeting Message</label>
              <textarea className="input" rows={3} value={botConfig.greeting} onChange={(e) => setBotConfig({ ...botConfig, greeting: e.target.value })} />
            </div>

            <div className={styles.configGroup}>
              <label className="label">After-Hours Auto-Response</label>
              <textarea className="input" rows={3} value={botConfig.after_hours} onChange={(e) => setBotConfig({ ...botConfig, after_hours: e.target.value })} />
            </div>

            <div className={styles.configGroup}>
              <label className="label">Booking Prompt</label>
              <textarea className="input" rows={2} value={botConfig.booking_prompt} onChange={(e) => setBotConfig({ ...botConfig, booking_prompt: e.target.value })} />
            </div>

            <div className={styles.configGroup}>
              <label className="label">FAQ Answers</label>
              {botConfig.faq.map((f, i) => (
                <div key={i} className={styles.faqRow}>
                  <input className="input" placeholder="Question" value={f.q} onChange={(e) => {
                    const updated = [...botConfig.faq];
                    updated[i] = { ...updated[i], q: e.target.value };
                    setBotConfig({ ...botConfig, faq: updated });
                  }} />
                  <input className="input" placeholder="Answer" value={f.a} onChange={(e) => {
                    const updated = [...botConfig.faq];
                    updated[i] = { ...updated[i], a: e.target.value };
                    setBotConfig({ ...botConfig, faq: updated });
                  }} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                    setBotConfig({ ...botConfig, faq: botConfig.faq.filter((_, idx) => idx !== i) });
                  }}>🗑️</button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                setBotConfig({ ...botConfig, faq: [...botConfig.faq, { q: "", a: "" }] });
              }}>+ Add FAQ</button>
            </div>

            <button className="btn btn-primary" onClick={saveBotConfig}>Save Configuration</button>
          </div>
        </div>
      ) : (
        <div className={styles.inboxLayout}>
          {/* Conversation List */}
          <div className={styles.convoList}>
            <div className={styles.convoListHeader}>
              <select className="input" value={filter} onChange={(e) => setFilter(e.target.value as "all" | "open" | "closed")} style={{ flex: 1 }}>
                <option value="all">All Conversations</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={handleNewConversation}>+</button>
            </div>

            {loading ? (
              <div className={styles.convoLoading}>Loading...</div>
            ) : conversations.length === 0 ? (
              <div className={styles.convoEmpty}>
                <p>No conversations yet</p>
                <button className="btn btn-secondary btn-sm" onClick={handleNewConversation}>Start One</button>
              </div>
            ) : (
              <div className={styles.convoItems}>
                {conversations.map((c) => (
                  <div
                    key={c.id}
                    className={`${styles.convoItem} ${selectedConvo?.id === c.id ? styles.convoActive : ""} ${c.unread_count > 0 ? styles.convoUnread : ""}`}
                    onClick={() => selectConversation(c)}
                  >
                    <div className={styles.convoIcon}>{CHANNEL_ICONS[c.channel] || "💬"}</div>
                    <div className={styles.convoInfo}>
                      <div className={styles.convoName}>{getConvoName(c)}</div>
                      <div className={styles.convoPreview}>{c.last_message || "No messages"}</div>
                    </div>
                    <div className={styles.convoMeta}>
                      <span className={styles.convoTime}>
                        {c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}
                      </span>
                      {c.unread_count > 0 && <span className={styles.unreadBadge}>{c.unread_count}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chat Panel */}
          <div className={styles.chatPanel}>
            {selectedConvo ? (
              <>
                <div className={styles.chatHeader}>
                  <div>
                    <h3>{getConvoName(selectedConvo)}</h3>
                    <span className={styles.chatChannel}>{CHANNEL_ICONS[selectedConvo.channel]} {selectedConvo.channel}</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <span className={`badge ${selectedConvo.status === "open" ? "badge-success" : "badge-warning"}`}>{selectedConvo.status}</span>
                    <button className="btn btn-ghost btn-sm" onClick={handleCloseConvo}>
                      {selectedConvo.status === "open" ? "Close" : "Reopen"}
                    </button>
                  </div>
                </div>

                <div className={styles.chatMessages}>
                  {messages.length === 0 ? (
                    <div className={styles.chatEmpty}>
                      <p>No messages in this conversation yet</p>
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={`${styles.message} ${styles[`msg_${m.sender_type}`]}`}>
                        <div className={styles.messageBubble}>
                          <p>{m.content}</p>
                        </div>
                        <span className={styles.messageTime}>
                          {m.sender_type === "bot" ? "🤖 AI" : m.sender_type === "staff" ? "You" : m.sender_name || "Client"}
                          {" · "}
                          {new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </span>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className={styles.chatCompose}>
                  {showQuickReplies && (
                    <div className={styles.quickReplies}>
                      {QUICK_REPLIES.map((r, i) => (
                        <button key={i} className={styles.quickReply} onClick={() => useQuickReply(r)}>
                          {r}
                        </button>
                      ))}
                    </div>
                  )}
                  <form onSubmit={handleSendMessage} className={styles.composeForm}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowQuickReplies(!showQuickReplies)} title="Quick replies">⚡</button>
                    <input className="input" value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Type a message..." style={{ flex: 1 }} />
                    <button type="submit" className="btn btn-primary btn-sm" disabled={!messageText.trim()}>Send</button>
                  </form>
                </div>
              </>
            ) : (
              <div className={styles.chatPlaceholder}>
                <h3>Select a conversation</h3>
                <p>Choose from the list or start a new conversation</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
