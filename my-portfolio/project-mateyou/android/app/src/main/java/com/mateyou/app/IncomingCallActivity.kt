package com.mateyou.app

import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class IncomingCallActivity : AppCompatActivity() {
    companion object {
        private const val TAG = "IncomingCallActivity"
        const val NOTIFICATION_ID = 1001
    }
    
    private var callerId: String? = null
    private var callerName: String? = null
    private var roomName: String? = null
    private var livekitUrl: String? = null
    private var callType: String? = null
    
    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        Log.d(TAG, "📞 IncomingCallActivity onCreate")
        
        // 잠금화면 위에 표시 + 화면 켜기
        setupWindowFlags()
        
        // 레이아웃 설정
        setContentView(R.layout.activity_incoming_call)
        
        // Intent에서 데이터 추출
        callerId = intent.getStringExtra("caller_id")
        callerName = intent.getStringExtra("caller_name") ?: "알 수 없음"
        roomName = intent.getStringExtra("room_name")
        livekitUrl = intent.getStringExtra("livekit_url")
        callType = intent.getStringExtra("call_type") ?: "voice"
        
        Log.d(TAG, "📞 Caller: $callerName, Room: $roomName, Type: $callType")
        
        // UI 설정
        setupUI()
        
        // 벨소리 + 진동 시작
        startRinging()
    }
    
    private var wakeLock: android.os.PowerManager.WakeLock? = null
    
    private fun setupWindowFlags() {
        // 화면 강제로 켜기 (WakeLock)
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
            wakeLock = powerManager.newWakeLock(
                android.os.PowerManager.FULL_WAKE_LOCK or
                android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP or
                android.os.PowerManager.ON_AFTER_RELEASE,
                "mateyou:IncomingCall"
            )
            wakeLock?.acquire(60000) // 60초 동안 화면 유지
            Log.d(TAG, "✅ WakeLock acquired")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to acquire WakeLock", e)
        }
        
        // 잠금화면 위에 표시
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            keyguardManager.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }
        
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
        )
    }
    
    private fun setupUI() {
        // 발신자 이름
        findViewById<TextView>(R.id.callerNameText)?.text = callerName
        
        // 통화 유형
        val callTypeText = if (callType == "video") "영상 통화" else "음성 통화"
        findViewById<TextView>(R.id.callTypeText)?.text = callTypeText
        
        // 수락 버튼
        findViewById<ImageButton>(R.id.acceptButton)?.setOnClickListener {
            Log.d(TAG, "✅ Call accepted")
            acceptCall()
        }
        
        // 거절 버튼
        findViewById<ImageButton>(R.id.declineButton)?.setOnClickListener {
            Log.d(TAG, "❌ Call declined")
            declineCall()
        }
    }
    
    private fun startRinging() {
        // 벨소리
        try {
            val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ringtone = RingtoneManager.getRingtone(this, ringtoneUri)
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                ringtone?.isLooping = true
            }
            
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val currentVolume = audioManager.getStreamVolume(AudioManager.STREAM_RING)
            
            if (currentVolume > 0) {
                ringtone?.play()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play ringtone", e)
        }
        
        // 진동
        try {
            vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vibratorManager.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            
            val pattern = longArrayOf(0, 1000, 500, 1000, 500, 1000)
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start vibration", e)
        }
    }
    
    private fun stopRinging() {
        ringtone?.stop()
        vibrator?.cancel()
    }
    
    private fun acceptCall() {
        stopRinging()
        cancelNotification()
        
        // SharedPreferences에서 livekit_token 가져오기
        val prefs = getSharedPreferences("incoming_call", Context.MODE_PRIVATE)
        val livekitToken = prefs.getString("livekit_token", "") ?: ""
        
        Log.d(TAG, "📞 Accepting call with token: ${livekitToken.take(50)}...")
        
        // 잠금화면 해제 시도
        dismissKeyguardAndLaunch(livekitToken)
    }
    
    private fun dismissKeyguardAndLaunch(livekitToken: String) {
        val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Android 8.0+: requestDismissKeyguard 사용
            keyguardManager.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
                override fun onDismissSucceeded() {
                    Log.d(TAG, "✅ Keyguard dismissed successfully")
                    launchMainActivity(livekitToken)
                }
                
                override fun onDismissCancelled() {
                    Log.d(TAG, "⚠️ Keyguard dismiss cancelled, launching anyway")
                    launchMainActivity(livekitToken)
                }
                
                override fun onDismissError() {
                    Log.e(TAG, "❌ Keyguard dismiss error, launching anyway")
                    launchMainActivity(livekitToken)
                }
            })
        } else {
            // 구버전: 바로 시작
            launchMainActivity(livekitToken)
        }
    }
    
    private fun launchMainActivity(livekitToken: String) {
        // MainActivity로 이동하여 통화 화면 표시
        val intent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            putExtra("type", "accept_call")
            putExtra("caller_id", callerId)
            putExtra("caller_name", callerName)
            putExtra("room_name", roomName)
            putExtra("livekit_url", livekitUrl)
            putExtra("livekit_token", livekitToken)
            putExtra("call_type", callType)
        }
        startActivity(intent)
        finish()
    }
    
    private fun declineCall() {
        stopRinging()
        cancelNotification()
        
        // TODO: 서버에 통화 거절 알림 전송
        Log.d(TAG, "📞 Sending decline notification to server")
        
        finish()
    }
    
    private fun cancelNotification() {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(NOTIFICATION_ID)
    }
    
    override fun onDestroy() {
        stopRinging()
        
        // WakeLock 해제
        try {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.d(TAG, "✅ WakeLock released")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to release WakeLock", e)
        }
        
        super.onDestroy()
    }
    
    override fun onBackPressed() {
        // 뒤로가기 버튼 무시 (통화 중에는 나갈 수 없음)
    }
}

