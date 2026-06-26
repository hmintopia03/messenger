import { useEffect, useRef, useState } from "react";

const randomName = () => {
  const names = ["Alice", "Bob", "Charlie", "Dana"];
  return names[Math.floor(Math.random() * names.length)];
};

function App() {
  const wsRef = useRef(null);
  const typingTimeout = useRef(null);

  const [name] = useState(randomName());
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [typingUser, setTypingUser] = useState("");

  useEffect(() => {
    const ws = new WebSocket("ws://127.0.0.1:8001/ws");
    wsRef.current = ws;

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);

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
      case "system":
        setMessages((prev) => [...prev, data]);
      
        break;

    
    }

  };

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "join",
          user: name,
        })
      );
    };

    return () => ws.close();
  }, []);

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
        message: text,
      })
    );

    wsRef.current.send(
      JSON.stringify({
        type: "stop_typing",
        user: name,
      })
    );

    setText("");
  };

  return (
    <div>
      <h1>Messenger</h1>
      <p>You are: {name}</p>

      <input
        value={text}
        onChange={(e) => {
          const value = e.target.value;
          setText(value);

          if (wsRef.current?.readyState !== WebSocket.OPEN) return;

          wsRef.current.send(
            JSON.stringify({
              type: value.trim() ? "typing" : "stop_typing",
              user: name,
            })
          );
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") sendMessage();
        }}
        placeholder="Type a message"
      />

      <button onClick={sendMessage}>Send</button>
      
      {typingUser && <p>{typingUser}</p>}
      <ul>
        {messages.map((msg, index) => (
          <li key={index}>
            {msg.type === "system" ? (
              <em>{msg.message}</em>
            ) : (
              <>
                <strong>{msg.user}</strong>: {msg.message}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;