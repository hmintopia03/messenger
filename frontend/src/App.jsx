import { useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";

const params = new URLSearchParams(window.location.search);
const port = params.get("port") || "8001";
const username = params.get("user") || "Anonymous";
const room = params.get("room") || "general";

function App() {
  const wsRef = useRef(null);
  const typingTimeout = useRef(null);
  const bottomRef = useRef(null);
  const heartbeatRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const processedMessageIdsRef = useRef(new Set());

  const [name] = useState(username);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [typingUser, setTypingUser] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [replyTo, setReplyTo] = useState(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let cancelled = false;

    // 1) 과거 메시지 fetch
    fetch(`http://127.0.0.1:${port}/messages?room=${room}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          data.forEach((msg) => processedMessageIdsRef.current.add(msg.id));
          setMessages(data);
        }
      })
      .catch((err) => console.error("fetch messages failed:", err))
      .finally(() => {
        // 2) fetch가 끝난 뒤에 WS 연결 시작 (race condition 방지)
        if (!cancelled) connectWebSocket();
      });

    function connectWebSocket() {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {

        const lastMessageId =
          messages.length > 0 ? messages[messages.length - 1].id : null;

        ws.send(
          JSON.stringify({
            type: "join",
            user: name,
            room,
            last_message_id: lastMessageId,
          })
        );

        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "ping",
                ts: Date.now(),
              })
            );
            console.log("PING");
          }
        }, 5000);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log(data);

        if (data.type === "pong") {
          console.log("PONG", data.ts);
          return;
        }

        switch (data.type) {
          case "typing":
            if (data.user !== name) {
              setTypingUser(`${data.user} is typing...`);
            }
            break;

          case "stop_typing":
            if (data.user !== name) {
              setTypingUser("");
            }
            break;

          case "chat":
            if (processedMessageIdsRef.current.has(data.id)) {
              console.log("[DUPLICATE] ignored", data.id);

              if (data.user !== name) {
                sendAck(data.id);
              }

              break;
            }

            processedMessageIdsRef.current.add(data.id);
            setMessages((prev) => [...prev, data]);

            if (data.user !== name) {
              sendAck(data.id);
            }

            if (data.user !== name && document.visibilityState === "visible") {
              setTimeout(() => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(
                    JSON.stringify({
                      type: "read",
                      room,
                      id: data.id,
                      user: name,
                    })
                  );
                }
              }, 2000);
            }
            break;
          case "system":
            console.log("system:", data.message);
            break;

          case "presence":
            setOnlineUsers(data.users);
            break;

          case "status":
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === data.id ? { ...msg, status: data.status } : msg
              )
            );
            break;

          case "replay":
            setMessages((prev) => {
              const newMessages = data.messages.filter((msg) => {
                if (processedMessageIdsRef.current.has(msg.id)) {
                  console.log("[DUPLICATE REPLAY] ignored", msg.id);
                  return false;
                }

                processedMessageIdsRef.current.add(msg.id);
                return true;
              });

              return [...prev, ...newMessages];
            });
            break;

          case "edit":
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === data.id ? { ...msg, message: data.message } : msg
              )
            );
            break;

          case "delete":
            setMessages((prev) => prev.filter((msg) => msg.id !== data.id));
            break;

          default:
            break;


        }
      };

      ws.onclose = () => {
        console.log("WebSocket closed. Reconnecting in 3s...");
        
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }

        if (!cancelled) {
          // 끊기면 3초 뒤 재연결 시도
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, 3000);
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        ws.close();
      };
    }

    return () => {
      cancelled = true;

      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      wsRef.current?.close();
    };
  }, []);

  const handleTyping = (value) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: value.trim() ? "typing" : "stop_typing",
        user: name,
        room,
      })
    );
  };

/*const sendAck = (messageId) => {
    console.log("ACK disabled for timeout test", messageId);
    return;
  };
  */

  const sendAck = (messageId) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: "ack",
        room,
        id: messageId,
        user: name,
      })
    );
  };

  const sendMessage = () => {
    if (!text.trim()) return;

    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      console.log("WebSocket is not open");
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: "chat",
        user: name,
        room,
        message: text,
        reply_to: replyTo
          ? {
              id: replyTo.id,
              user: replyTo.user,
              message: replyTo.message,
            }
          : null,
      })
    );

    wsRef.current.send(
      JSON.stringify({
        type: "stop_typing",
        user: name,
        room,
      })
    );

    setText("");
    setReplyTo(null);
  };

  const editMessage = (msg) => {
    const newText = prompt("Edit message", msg.message);
    if (!newText) return;

    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      console.log("WebSocket is not open");
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: "edit",
        room,
        id: msg.id,
        message: newText,
      })
    );
  };

  const deleteMessage = (msg) => {
    if (!confirm("Delete this message?")) return;

    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      console.log("WebSocket is not open");
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: "delete",
        room,
        id: msg.id,
      })
    );
  };

  const isSameGroup = (a, b) => {
    if (!a || !b) return false;
    if (a.user !== b.user) return false;

    const aTime = new Date(a.created_at + "Z").getTime();
    const bTime = new Date(b.created_at + "Z").getTime();

    const diff = Math.abs(bTime - aTime);
    return diff <= 60 * 1000;
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        maxWidth: "800px",
        margin: "0 auto",
      }}
    >
      <div
        style={{
          padding: "10px 16px",
          textAlign: "center",
          borderBottom: "1px solid #333",
        }}
      >
        <h2 style={{ margin: "0 0 4px 0" }}>Messenger</h2>

        <div style={{ fontSize: "13px", opacity: 0.8 }}>
          {room} · {name} · Online: {onlineUsers.join(", ")}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
        }}
      >
        <ul style={{ padding: 0, margin: 0 }}>
          {messages.map((msg, index) => {
            const previous = messages[index - 1];
            const next = messages[index + 1];

            const isFirstInGroup = !isSameGroup(previous, msg);
            const isLastInGroup = !isSameGroup(msg, next);

            return (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isMine={msg.user === name}
                isFirstInGroup={isFirstInGroup}
                isLastInGroup={isLastInGroup}
                onEdit={editMessage}
                onDelete={deleteMessage}
                onReply={setReplyTo}
              />
            );
          })}
        </ul>

        <div ref={bottomRef} />
      </div>

      <div style={{ padding: "12px", borderTop: "1px solid #333" }}>
        <MessageInput
          text={text}
          setText={setText}
          replyTo={replyTo}
          setReplyTo={setReplyTo}
          onSend={sendMessage}
          onTyping={handleTyping}
        />

        {typingUser && <p>{typingUser}</p>}
      </div>
    </div>
  );
}

export default App;