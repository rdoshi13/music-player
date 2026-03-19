import { useState, useContext, useEffect } from "react";
import { PlayerContext } from "../context/AppPlayerContext";

const SleepTimer = () => {
  const { audioRef } = useContext(PlayerContext);
  const [timer, setTimer] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);

  useEffect(() => {
    if (timer > 0 && isTimerActive) {
      const timeout = setTimeout(() => {
        audioRef.current.pause();
        setIsTimerActive(false);
      }, timer * 1000);
      return () => clearTimeout(timeout);
    }
  }, [timer, isTimerActive, audioRef]);

  const startTimer = (seconds) => {
    setTimer(seconds);
    setIsTimerActive(true);
  };

  return (
    <section className="panel timer-panel" aria-label="Sleep Timer">
      <header className="panel-head">
        <p className="panel-eyebrow">Auto Pause</p>
        <h3 className="panel-title">Sleep Timer</h3>
      </header>
      <div className="timer-actions">
        <button className="btn btn-ghost" onClick={() => startTimer(300)}>
          5 Minutes
        </button>
        <button className="btn btn-ghost" onClick={() => startTimer(900)}>
          15 Minutes
        </button>
        <button className="btn btn-ghost" onClick={() => startTimer(1800)}>
          30 Minutes
        </button>
        <button className="btn btn-danger" onClick={() => setIsTimerActive(false)}>
          Cancel
        </button>
      </div>
      <p className="helper-text">
        {isTimerActive
          ? `Timer active: pause in ${Math.round(timer / 60)} min`
          : "No timer is active"}
      </p>
    </section>
  );
};

export default SleepTimer;
