import logo from './logo.svg';
import './App.css';

function App() {
  return (
    <div className="App">
      <video className="input_video" width="1280px" height="720px" autoPlay muted playsInline></video>
      //<canvas className="guides"></canvas>
      //<header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
