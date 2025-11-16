import React, { useState, useEffect, useRef } from 'react';
import { Battery, Zap, BellRing, Volume2, Check } from 'lucide-react';

export default function PowerOutageAlert() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [batteryStatus, setBatteryStatus] = useState({ charging: false, level: 0 });
  const [alarmActive, setAlarmActive] = useState(false);
  const [lastOutage, setLastOutage] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState('default');
  
  const audioRef = useRef(null);
  const batteryRef = useRef(null);
  const monitoringRef = useRef(false);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
    
    const audio = new Audio();
    audio.loop = true;
    audio.volume = 0.8;
    
    const oscillator = new (window.AudioContext || window.webkitAudioContext)();
    const dest = oscillator.createMediaStreamDestination();
    const osc = oscillator.createOscillator();
    const gain = oscillator.createGain();
    
    osc.connect(gain);
    gain.connect(dest);
    osc.frequency.value = 800;
    gain.gain.value = 0.3;
    osc.type = 'sine';
    osc.start();
    
    audio.srcObject = dest.stream;
    audioRef.current = audio;

    if ('navigator' in window && 'getBattery' in navigator) {
      navigator.getBattery().then(battery => {
        batteryRef.current = battery;
        updateBatteryStatus(battery);
        
        battery.addEventListener('chargingchange', () => handleChargingChange(battery));
        battery.addEventListener('levelchange', () => updateBatteryStatus(battery));
      });
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const updateBatteryStatus = (battery) => {
    setBatteryStatus({
      charging: battery.charging,
      level: Math.round(battery.level * 100)
    });
  };

  const handleChargingChange = (battery) => {
    updateBatteryStatus(battery);
    
    if (monitoringRef.current && !battery.charging && battery.level < 0.99) {
      triggerOutageAlert();
    } else if (battery.charging && alarmActive) {
      stopAlarm();
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }
  };

  const triggerOutageAlert = () => {
    setAlarmActive(true);
    setLastOutage(new Date().toLocaleTimeString());
    
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }

    if ('vibrate' in navigator) {
      navigator.vibrate([500, 200, 500, 200, 500]);
    }

    if (Notification.permission === 'granted') {
      const notification = new Notification('Power Outage Detected!', {
        body: 'Your device stopped charging. Tap to dismiss alarm.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'power-outage',
        requireInteraction: true,
        actions: [
          { action: 'stop', title: 'Stop Alarm' }
        ]
      });

      notification.onclick = () => {
        stopAlarm();
        notification.close();
      };
    }
  };

  const stopAlarm = () => {
    setAlarmActive(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const toggleMonitoring = async () => {
    if (!isMonitoring) {
      await requestNotificationPermission();
      if (batteryRef.current && batteryRef.current.charging) {
        setIsMonitoring(true);
        monitoringRef.current = true;
      }
    } else {
      setIsMonitoring(false);
      monitoringRef.current = false;
      stopAlarm();
    }
  };

  const shareApp = async () => {
    const shareData = {
      title: 'Power Outage Alert',
      text: 'Get notified when there\'s a power outage while your phone is charging',
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {}
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        maxWidth: '420px',
        margin: '0 auto',
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '24px',
        padding: '32px 24px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
      }}>
        
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '72px',
            height: '72px',
            background: alarmActive ? '#ef4444' : isMonitoring ? '#10b981' : '#3b82f6',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            transition: 'all 0.3s ease',
            animation: alarmActive ? 'pulse 1s infinite' : 'none'
          }}>
            {alarmActive ? (
              <BellRing size={36} color="white" />
            ) : (
              <Zap size={36} color="white" />
            )}
          </div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#1f2937',
            margin: '0 0 8px 0'
          }}>
            Power Guard
          </h1>
          <p style={{
            fontSize: '15px',
            color: '#6b7280',
            margin: 0
          }}>
            Stay informed about power outages
          </p>
        </div>

        <div style={{
          background: '#f3f4f6',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <Battery size={24} color={batteryStatus.charging ? '#10b981' : '#6b7280'} />
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '14px',
                color: '#6b7280',
                marginBottom: '4px'
              }}>
                Battery Status
              </div>
              <div style={{
                fontSize: '18px',
                fontWeight: '600',
                color: '#1f2937'
              }}>
                {batteryStatus.level}% • {batteryStatus.charging ? 'Charging' : 'Not Charging'}
              </div>
            </div>
          </div>
        </div>

        {alarmActive && (
          <div style={{
            background: '#fee2e2',
            border: '2px solid #ef4444',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px',
            animation: 'shake 0.5s infinite'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <Volume2 size={24} color="#dc2626" />
              <div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#dc2626' }}>
                  Power Outage Detected!
                </div>
                <div style={{ fontSize: '14px', color: '#991b1b', marginTop: '4px' }}>
                  {lastOutage}
                </div>
              </div>
            </div>
            <button
              onClick={stopAlarm}
              style={{
                width: '100%',
                padding: '14px',
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <Check size={20} />
              Stop Alarm
            </button>
          </div>
        )}

        <button
          onClick={toggleMonitoring}
          disabled={!batteryStatus.charging && !isMonitoring}
          style={{
            width: '100%',
            padding: '18px',
            background: isMonitoring ? '#ef4444' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '16px',
            fontSize: '17px',
            fontWeight: '600',
            cursor: batteryStatus.charging || isMonitoring ? 'pointer' : 'not-allowed',
            marginBottom: '12px',
            opacity: (!batteryStatus.charging && !isMonitoring) ? 0.5 : 1,
            transition: 'all 0.2s ease'
          }}
        >
          {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
        </button>

        {!batteryStatus.charging && !isMonitoring && (
          <p style={{
            fontSize: '14px',
            color: '#ef4444',
            textAlign: 'center',
            margin: '0 0 16px 0'
          }}>
            Please plug in your device to start monitoring
          </p>
        )}

        <button
          onClick={shareApp}
          style={{
            width: '100%',
            padding: '14px',
            background: 'white',
            color: '#3b82f6',
            border: '2px solid #3b82f6',
            borderRadius: '16px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Share This App
        </button>

        {notificationPermission === 'default' && (
          <div style={{
            marginTop: '20px',
            padding: '16px',
            background: '#eff6ff',
            borderRadius: '12px',
            fontSize: '14px',
            color: '#1e40af',
            textAlign: 'center'
          }}>
            Enable notifications to receive alerts even when the app is in the background
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}