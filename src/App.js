import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";
import Home from "./pages/Home.js";
import Chat from "./pages/Chat.js";


function App() {
  return (
    <Router basename="/AIChatSite">
      <div className="app">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/chat/:id" element={<Chat />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;