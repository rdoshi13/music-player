import React, { useState, useContext, useEffect } from 'react';
import { PlayerContext } from '../context/PlayerContext';

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
    <div>
      <h3>Sleep Timer</h3>
      <button onClick={() => startTimer(300)}>5 Minutes</button>
      <button onClick={() => startTimer(900)}>15 Minutes</button>
      <button onClick={() => startTimer(1800)}>30 Minutes</button>
      <button onClick={() => setIsTimerActive(false)}>Cancel Timer</button>
    </div>
  );
};

export default SleepTimer;
