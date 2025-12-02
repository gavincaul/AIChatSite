import React from 'react';
import { Link } from 'react-router-dom';
import chatOptions from '../data/chatOptions.json';
import '../styles/Home.css';
import Navbar from '../components/Navbar';

const Home = () => {
  return (
    <div className="home">
      <Navbar />
      <div className="chat-options-container">
        <h1>Choose a Chat Category</h1>
        <div className="chat-options-grid">
          {chatOptions.chats.map((chat) => (
            <Link to={`/chat/${chat.id}`} key={chat.id} className="chat-option">
              <div className="chat-option-icon">{chat.icon}</div>
              <h3>{chat.title}</h3>
              <p>{chat.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Home;